import type { Trip } from "../../../frontend/trip-types";

const imageUrl = "/assets/share-card.png";

export function appShareInfo() {
  return { title: "旅行分账 · 一起记账，轻松分担", path: "/pages/home/index", imageUrl };
}

export function shareInfo(trip: Pick<Trip, "id" | "title">) {
  return {
    title: `${trip.title} · 分账清单`,
    path: `/pages/share/index?tripId=${encodeURIComponent(trip.id)}`,
    imageUrl,
  };
}
