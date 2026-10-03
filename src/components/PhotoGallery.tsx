"use client";

import { useEffect, useState } from "react";
import type { Tables } from "@/lib/supabase/database.types";

type PhotoRow = Pick<Tables<"case_photos">, "id" | "category" | "file_size_bytes">;

const CATEGORY_LABELS: Record<string, string> = {
  front: "Front",
  rear: "Rear",
  left: "Left side",
  right: "Right side",
  interior_odometer: "Interior / dashboard",
  other: "Additional",
};

export function PhotoGallery({ photos }: { photos: PhotoRow[] }) {
  if (photos.length === 0) {
    return <p className="text-sm text-zinc-500 dark:text-zinc-400">No photos.</p>;
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
      {photos.map((photo) => (
        <PhotoThumb key={photo.id} photo={photo} />
      ))}
    </div>
  );
}

function PhotoThumb({ photo }: { photo: PhotoRow }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/photos/${photo.id}/signed-url`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => {
        if (!cancelled) setUrl(data.url);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [photo.id]);

  return (
    <div className="rounded-md border border-zinc-200 p-2 dark:border-zinc-800">
      <p className="mb-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
        {CATEGORY_LABELS[photo.category] ?? photo.category}
      </p>
      {failed ? (
        <div className="flex h-20 items-center justify-center rounded bg-zinc-100 text-xs text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500">
          Unavailable
        </div>
      ) : url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={photo.category} className="h-20 w-full rounded object-cover" />
      ) : (
        <div className="h-20 w-full animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
      )}
      <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">{(photo.file_size_bytes / 1024).toFixed(0)} KB</p>
    </div>
  );
}
