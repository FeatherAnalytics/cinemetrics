{#
  Pin QUOTE and ESCAPE on the seed COPY instead of letting DuckDB detect them.

  dbt-duckdb's own `duckdb__load_csv_rows` passes only FORMAT, HEADER and
  DELIMITER, so DuckDB auto-detects the rest of the dialect. Detection reads the
  first chunk of the file (~2048 rows) and no further. Every seed here has fields
  that need quoting (genres and keywords hold commas) but, until 2026-08-03, none
  had ever held an escaped quote — so nothing in that first chunk distinguished
  `escape = "` from `escape = (empty)`, and DuckDB settled on empty.

  A candidate then arrived titled `Usada Pekora 1st PekoLive - "USAGI the
  MEGAMI!!"`. ingest/csvio.py escaped it correctly, as `""`, per RFC 4180. It
  landed on line 11392 — past the detected chunk — and the nightly build died:

      Invalid Input Error: CSV Error on Line: 11392
      Value with unterminated quote found.

  The failure is positional, not new: the same title inside the first 2048 rows
  loads fine, because there the sniffer sees the `""` and infers the escape. So
  this was always waiting on the first film whose title contains a double quote
  and whose row sorts late, and it will keep arriving as TMDB adds titles.

  Everything below the option list is dbt-duckdb's macro unchanged. If a DuckDB
  release starts detecting the escape from the whole file rather than the first
  chunk, tests/test_seed_copy.py will say so and this file can go.
#}
{% macro duckdb__load_csv_rows(model, agate_table) %}
    {% if config.get('fast', true) %}
        {% set seed_file_path = adapter.get_seed_file_path(model) %}
        {% set delimiter = config.get('delimiter', ',') %}
        {% set sql %}
          COPY {{ this.render() }} FROM '{{ seed_file_path }}' (FORMAT CSV, HEADER TRUE, DELIMITER '{{ delimiter }}', QUOTE '"', ESCAPE '"')
        {% endset %}
        {% do adapter.add_query(sql, abridge_sql_log=True) %}
        {{ return(sql) }}
    {% endif %}

    {% set batch_size = get_batch_size() %}
    {% set agate_table = adapter.convert_datetimes_to_strs(agate_table) %}
    {% set cols_sql = get_seed_column_quoted_csv(model, agate_table.column_names) %}
    {% set bindings = [] %}

    {% set statements = [] %}

    {% for chunk in agate_table.rows | batch(batch_size) %}
        {% set bindings = [] %}

        {% for row in chunk %}
            {% do bindings.extend(row) %}
        {% endfor %}

        {% set sql %}
            insert into {{ this.render() }} ({{ cols_sql }}) values
            {% for row in chunk -%}
                ({%- for column in agate_table.column_names -%}
                    {{ get_binding_char() }}
                    {%- if not loop.last%},{%- endif %}
                {%- endfor -%})
                {%- if not loop.last%},{%- endif %}
            {%- endfor %}
        {% endset %}

        {% do adapter.add_query(sql, bindings=bindings, abridge_sql_log=True) %}

        {% if loop.index0 == 0 %}
            {% do statements.append(sql) %}
        {% endif %}
    {% endfor %}

    {# Return SQL so we can render it out into the compiled files #}
    {{ return(statements[0]) }}
{% endmacro %}
