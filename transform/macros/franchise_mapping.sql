{#-
    Curated rollup of films into umbrella franchises, emitted as an inline
    VALUES table. Each rule carries exactly one key:
      - collection: remaps every film in that TMDB collection
      - tmdb_id:    catches a film TMDB left out of any collection
      - director:   groups an auteur's films (auto-catches future watches)
    Precedence when a film matches several rules is decided in dim_film:
    film > collection > director.
-#}

{%- macro _sql_str(value) -%}
    {%- if value is not none -%}'{{ value | replace("'", "''") }}'{%- else -%}cast(null as varchar){%- endif -%}
{%- endmacro -%}

{% macro franchise_mapping() %}
{%- set rules = [
    {"collection": "The Avengers Collection",         "franchise": "MCU"},
    {"collection": "Captain America Collection",      "franchise": "MCU"},
    {"collection": "Captain Marvel Collection",       "franchise": "MCU"},
    {"collection": "Black Panther Collection",        "franchise": "MCU"},
    {"collection": "Doctor Strange Collection",       "franchise": "MCU"},
    {"collection": "Guardians of the Galaxy Collection", "franchise": "MCU"},
    {"collection": "Spider-Man (MCU) Collection",     "franchise": "MCU"},
    {"collection": "Thor Collection",                 "franchise": "MCU"},
    {"tmdb_id": 497698,                               "franchise": "MCU"},
    {"director": "Hayao Miyazaki",                    "franchise": "Miyazaki"},
] -%}
(
    values
    {%- for r in rules %}
        (
            {{ _sql_str(r.get("collection")) }},
            {{ r.get("tmdb_id") if r.get("tmdb_id") is not none else "cast(null as bigint)" }},
            {{ _sql_str(r.get("director")) }},
            {{ _sql_str(r.get("franchise")) }}
        ){{ "," if not loop.last }}
    {%- endfor %}
) as franchise_rules (collection_name, tmdb_id, director, franchise)
{% endmacro %}
