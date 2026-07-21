"use client";

import { useEffect, useState } from "react";

export const FALLBACK_VERSION = "v0.1.0";
export const RELEASES_PAGE = "https://github.com/wadjakorn/capz/releases/latest";

type Asset = { name: string; browser_download_url: string };
type Release = { tag_name: string; assets: Asset[]; html_url: string };

function pickWindowsAsset(assets: Asset[] | undefined): string | undefined {
  if (!assets?.length) return undefined;
  const exe = assets.find((a) => /\.exe$/i.test(a.name));
  return exe?.browser_download_url;
}

/**
 * Fetches the latest GitHub release directly (no react-query — that dep isn't
 * part of capz's stack). Runs client-side only; SSR/export renders the loading
 * state and the browser fills it in on hydrate.
 */
export function useLatestRelease() {
  const [data, setData] = useState<Release | null>(null);
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");

  useEffect(() => {
    let active = true;
    fetch("https://api.github.com/repos/wadjakorn/capz/releases/latest", {
      headers: { Accept: "application/vnd.github+json" },
    })
      .then((res) => {
        if (!res.ok) throw new Error(`GitHub API ${res.status}`);
        return res.json() as Promise<Release>;
      })
      .then((json) => {
        if (active) {
          setData(json);
          setStatus("success");
        }
      })
      .catch(() => {
        if (active) setStatus("error");
      });
    return () => {
      active = false;
    };
  }, []);

  return {
    version: data?.tag_name ?? (status === "error" ? FALLBACK_VERSION : undefined),
    windowsAssetUrl: pickWindowsAsset(data?.assets) ?? RELEASES_PAGE,
    releasePageUrl: data?.html_url ?? RELEASES_PAGE,
    isLoading: status === "loading",
    isError: status === "error",
  };
}
