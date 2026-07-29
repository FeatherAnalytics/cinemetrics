-- Fails while stg_film_enrichment still hands dim_film a literal NULL instead
-- of reading the seed column. A not_null test cannot do this job: films TMDB
-- serves no poster for are legitimately NULL, so the invariant is "most films
-- have one", not "every film does".
select count(*) as films_with_a_poster
from {{ ref('dim_film') }}
where poster_path is not null
having count(*) < 100
