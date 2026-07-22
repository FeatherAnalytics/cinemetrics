"use client";

import {
  createContext,
  useContext,
  useReducer,
  type ReactNode,
  type Dispatch,
} from "react";
import type { RecommendationFilters } from "./recommend";

export type RecommendMode = "similar" | "recommend" | "genre-recommend";

export type RecommendState = {
  open: boolean;
  mode: RecommendMode;
  sourceTmdbId: number | null;
  genre: string | null;
  filters: RecommendationFilters;
  hideRated: boolean;
};

export const initialRecommendState: RecommendState = {
  open: false,
  mode: "recommend",
  sourceTmdbId: null,
  genre: null,
  filters: {},
  hideRated: true,
};

type Action =
  | { type: "OPEN_SIMILAR"; tmdbId: number }
  | { type: "OPEN_RECOMMEND" }
  | { type: "OPEN_GENRE_RECOMMEND"; genre: string }
  | { type: "CLOSE" }
  | { type: "SET_LANGUAGE"; language: "en" | "non-en" | undefined }
  | { type: "SET_RUNTIME_RANGE"; range: [number, number] | undefined }
  | { type: "TOGGLE_HIDE_RATED" }
  | { type: "SHUFFLE" };

export function recommendReducer(state: RecommendState, action: Action): RecommendState {
  switch (action.type) {
    case "OPEN_SIMILAR":
      return {
        ...state,
        open: true,
        mode: "similar",
        sourceTmdbId: action.tmdbId,
        genre: null,
      };
    case "OPEN_RECOMMEND":
      return {
        ...state,
        open: true,
        mode: "recommend",
        sourceTmdbId: null,
        genre: null,
      };
    case "OPEN_GENRE_RECOMMEND":
      return {
        ...state,
        open: true,
        mode: "genre-recommend",
        sourceTmdbId: null,
        genre: action.genre,
      };
    case "CLOSE":
      return { ...initialRecommendState };
    case "SET_LANGUAGE":
      return { ...state, filters: { ...state.filters, language: action.language } };
    case "SET_RUNTIME_RANGE":
      return { ...state, filters: { ...state.filters, runtimeRange: action.range } };
    case "TOGGLE_HIDE_RATED":
      return { ...state, hideRated: !state.hideRated };
    case "SHUFFLE":
      return { ...state };
    default:
      return state;
  }
}

type RecommendContextValue = {
  state: RecommendState;
  dispatch: Dispatch<Action>;
};

const RecommendCtx = createContext<RecommendContextValue | null>(null);

export function RecommendProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(recommendReducer, initialRecommendState);
  return (
    <RecommendCtx.Provider value={{ state, dispatch }}>
      {children}
    </RecommendCtx.Provider>
  );
}

export function useRecommend(): RecommendContextValue {
  const ctx = useContext(RecommendCtx);
  if (!ctx) throw new Error("useRecommend must be inside RecommendProvider");
  return ctx;
}
