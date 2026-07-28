{#
  Use custom schema names verbatim instead of prefixing them with the target
  schema.

  dbt's default is `{{ target.schema }}_{{ custom_schema_name }}`, which exists so
  that several developers can build into one warehouse without colliding. This
  project has a single target and the database file is disposable and local, so
  the prefix buys nothing and would name every relation `main_marts.dim_film`.

  Models and seeds with no `+schema` still land in target.schema (`main`).
#}
{% macro generate_schema_name(custom_schema_name, node) -%}
    {%- if custom_schema_name is none -%}
        {{ target.schema }}
    {%- else -%}
        {{ custom_schema_name | trim }}
    {%- endif -%}
{%- endmacro %}
