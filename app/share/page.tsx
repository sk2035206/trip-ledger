import type { Metadata } from "next";
import { ShareViewer } from "./share-viewer";
import type { Trip } from "@/frontend/trip-types";
import { calculateTrip, formatMoney, normalizeAppState } from "@/frontend/trip-utils";

export const dynamic = "force-dynamic";

const backendBaseUrl = process.env.TRIP_LEDGER_API_URL ?? "http://127.0.0.1:5174";
const siteUrl = normalizeSiteUrl(process.env.NEXT_PUBLIC_SITE_URL ?? "https://jcxxy.cn/ledger/");
const shareImage = new URL("/api/share-card.png", siteUrl).toString();
const defaultTitle = "旅行分账清单";
const defaultDescription = "查看本次旅行费用分账清单。";

type SharePageProps = {
  searchParams: Promise<{ tripId?: string }>;
};

export async function generateMetadata({ searchParams }: SharePageProps): Promise<Metadata> {
  const { tripId = "" } = await searchParams;
  const trip = await loadShareTrip(tripId);
  const metadata = buildShareMetadata(trip, tripId);

  return {
    title: metadata.title,
    description: metadata.description,
    openGraph: {
      title: metadata.title,
      description: metadata.description,
      url: metadata.url,
      type: "website",
      locale: "zh_CN",
      images: [
        {
          url: shareImage,
          width: 1200,
          height: 630,
          alt: metadata.title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: metadata.title,
      description: metadata.description,
      images: [shareImage],
    },
  };
}

export default async function SharePage({
  searchParams,
}: SharePageProps) {
  const params = await searchParams;
  const tripId = params.tripId ?? "";
  const initialTrip = await loadShareTrip(tripId);
  return <ShareViewer tripId={tripId} initialTrip={initialTrip} />;
}

async function loadShareTrip(tripId: string): Promise<Trip | null> {
  if (!tripId) return null;

  try {
    const response = await fetch(`${backendBaseUrl}/api/trips/${encodeURIComponent(tripId)}`, {
      headers: {
        Accept: "application/json",
      },
      cache: "no-store",
    });
    if (!response.ok) return null;

    const payload = (await response.json()) as { trip?: unknown };
    const state = normalizeAppState({ trips: payload.trip ? [payload.trip] : [] });
    return state.trips[0] ?? null;
  } catch {
    return null;
  }
}

function buildShareMetadata(trip: Trip | null, tripId: string) {
  const url = createShareUrl(tripId);
  if (!trip) {
    return {
      title: defaultTitle,
      description: defaultDescription,
      url,
    };
  }

  const totals = calculateTrip(trip);
  return {
    title: `${trip.title}分账清单`,
    description: `共${trip.members.length}人，合计${formatMoney(totals.finalTotal)}，查看本次出行费用明细。`,
    url,
  };
}

function createShareUrl(tripId: string) {
  const url = new URL("share", siteUrl);
  if (tripId) url.searchParams.set("tripId", tripId);
  return url.toString();
}

function normalizeSiteUrl(value: string) {
  return value.endsWith("/") ? value : `${value}/`;
}
