-- One row per calendar quarter: aggregate taste metrics over time.
with watch_genres as (
    select
        w.watch_id,
        w.tmdb_id,
        w.watched_date,
        w.rating_100,
        w.is_rewatch_effective,
        w.is_return,
        w.liked,
        f.metascore,
        g.genre
    from {{ ref('fct_watches') }} w
    left join {{ ref('dim_film') }} f on w.tmdb_id = f.tmdb_id
    left join {{ ref('bridge_film_genre') }} g
        on w.tmdb_id = g.tmdb_id and not g.is_candidate
),

quarters as (
    select distinct
        year(watched_date) || '-Q' || quarter(watched_date) as period,
        watched_date,
        watch_id,
        tmdb_id,
        rating_100,
        is_rewatch_effective,
        is_return,
        liked,
        metascore,
        genre
    from watch_genres
),

per_period as (
    select
        period,
        count(distinct watch_id) as watches,
        count(distinct tmdb_id) as films,
        avg(rating_100) as mean_rating_100,
        -- Rewatch share: is_rewatch_effective over the answerable denominator.
        -- A row is answerable when liked is not null (Letterboxd-era) or is_return
        -- (the ordinal test works for any era).
        sum(case when is_rewatch_effective then 1 else 0 end) * 1.0
            / nullif(sum(case when liked is not null or is_return then 1 else 0 end), 0)
            as rewatch_share,
        -- Liked share over rows that recorded the field.
        sum(case when liked then 1 else 0 end) * 1.0
            / nullif(sum(case when liked is not null then 1 else 0 end), 0)
            as liked_share,
        -- Mean gap between personal rating and Metascore.
        avg(case when rating_100 is not null and metascore is not null
            then rating_100 - metascore end)
            as critic_delta
    from (
        select distinct watch_id, period, tmdb_id, rating_100,
            is_rewatch_effective, is_return, liked, metascore
        from quarters
    )
    group by period
),

genre_shares as (
    select
        period,
        count(distinct case when genre = 'Horror' then watch_id end) * 1.0
            / nullif(count(distinct watch_id), 0) as horror_share,
        count(distinct case when genre = 'Thriller' then watch_id end) * 1.0
            / nullif(count(distinct watch_id), 0) as thriller_share,
        count(distinct case when genre = 'Drama' then watch_id end) * 1.0
            / nullif(count(distinct watch_id), 0) as drama_share,
        count(distinct case when genre = 'Comedy' then watch_id end) * 1.0
            / nullif(count(distinct watch_id), 0) as comedy_share,
        count(distinct case when genre = 'Adventure' then watch_id end) * 1.0
            / nullif(count(distinct watch_id), 0) as adventure_share
    from quarters
    group by period
)

select
    p.period,
    p.watches,
    p.films,
    round(p.mean_rating_100, 1) as mean_rating_100,
    round(p.rewatch_share, 3) as rewatch_share,
    round(p.liked_share, 3) as liked_share,
    round(p.critic_delta, 1) as critic_delta,
    round(g.horror_share, 3) as horror_share,
    round(g.thriller_share, 3) as thriller_share,
    round(g.drama_share, 3) as drama_share,
    round(g.comedy_share, 3) as comedy_share,
    round(g.adventure_share, 3) as adventure_share
from per_period p
left join genre_shares g using (period)
order by period
