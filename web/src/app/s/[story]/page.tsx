import type { Metadata } from "next";
import { ExplorerApp } from "@/components/ExplorerApp";
import type { Dataset } from "@/lib/types";
import dataset from "../../../../public/data/cinemetrics.json";
import { STORIES } from "@/lib/stories";

const STORY_META: Record<string, { title: string; description: string }> = {
  heart: { title: "Favs and likes", description: "Where the Letterboxd heart falls in my ratings, and the four films it singles out." },
  spooktober: { title: "Spooktober", description: "October horror viewing as a seasonal ritual." },
  "hidden-gems": { title: "Hidden gems", description: "The films I rated highest that nobody else watched." },
  runtime: { title: "Runtime", description: "How long the films I watch run, and whether length tracks with quality." },
  "getting-pickier": { title: "Getting pickier", description: "Rating trends across eight years of logging." },
  binges: { title: "Double features", description: "Days with two or more films, and what they have in common." },
  franchises: { title: "Franchise runs", description: "Multi-film arcs through shared universes." },
  stats: { title: "The shape of it", description: "What predicts my rating, and what only predicts how much I watch." },
  watchlist: { title: "Watchlist", description: "Films waiting to be watched, by genre, decade, and origin." },
};

export function generateStaticParams() {
  return STORIES.map((s) => ({ story: s.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ story: string }> }): Promise<Metadata> {
  const { story } = await params;
  const meta = STORY_META[story] ?? { title: "cinemetrics", description: "" };
  return {
    title: `${meta.title} — cinemetrics`,
    description: meta.description,
    openGraph: {
      title: `${meta.title} — cinemetrics`,
      description: meta.description,
      images: [{ url: `og.png`, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${meta.title} — cinemetrics`,
      description: meta.description,
      images: [{ url: `og.png` }],
    },
  };
}

export default async function StoryPage({ params }: { params: Promise<{ story: string }> }) {
  const { story } = await params;
  return <ExplorerApp data={dataset as unknown as Dataset} initialStory={story} />;
}
