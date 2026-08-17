"use client";

import { useEffect } from "react";

type WechatShareProps = {
  title: string;
  description: string;
  link: string;
  imageUrl: string;
  signatureEndpoint: string;
  priority?: number;
};

type WechatSignature = {
  appId: string;
  timestamp: number | string;
  nonceStr: string;
  signature: string;
};

type WechatApi = {
  config: (options: {
    debug: boolean;
    appId: string;
    timestamp: number | string;
    nonceStr: string;
    signature: string;
    jsApiList: string[];
  }) => void;
  ready: (callback: () => void) => void;
  error: (callback: (error: unknown) => void) => void;
  updateAppMessageShareData?: (options: ShareOptions) => void;
  updateTimelineShareData?: (options: ShareOptions) => void;
  onMenuShareAppMessage?: (options: ShareOptions) => void;
  onMenuShareTimeline?: (options: ShareOptions) => void;
};

type ShareOptions = {
  title: string;
  desc?: string;
  link: string;
  imgUrl: string;
};

declare global {
  interface Window {
    wx?: WechatApi;
  }
}

const wechatSdkUrl = "https://res.wx.qq.com/open/js/jweixin-1.6.0.js";
let activeSharePriority = 0;
let shareSequence = 0;
let isWechatConfigured = false;

export function WechatShare({
  title,
  description,
  link,
  imageUrl,
  signatureEndpoint,
  priority = 0,
}: WechatShareProps) {
  useEffect(() => {
    if (!isWechatBrowser()) return;
    if (priority < activeSharePriority) return;
    activeSharePriority = priority;

    let cancelled = false;
    const sequence = ++shareSequence;

    async function setupWechatShare() {
      try {
        await loadWechatSdk();
        if (cancelled || !window.wx || sequence !== shareSequence) return;

        const shareData = createShareData({ title, description, link, imageUrl });
        if (isWechatConfigured) {
          applyWechatShareData(shareData);
          return;
        }

        const currentUrl = window.location.href.split("#")[0];
        const signatureUrl = `${signatureEndpoint}?url=${encodeURIComponent(currentUrl)}`;
        const signature = await fetch(signatureUrl).then((response) => {
          if (!response.ok) throw new Error(`微信签名接口异常：${response.status}`);
          return response.json() as Promise<WechatSignature>;
        });

        if (cancelled || !window.wx || sequence !== shareSequence) return;

        window.wx.config({
          debug: false,
          appId: signature.appId,
          timestamp: signature.timestamp,
          nonceStr: signature.nonceStr,
          signature: signature.signature,
          jsApiList: ["updateAppMessageShareData", "updateTimelineShareData", "onMenuShareAppMessage", "onMenuShareTimeline"],
        });

        window.wx.ready(() => {
          if (cancelled || sequence !== shareSequence) return;
          isWechatConfigured = true;
          applyWechatShareData(shareData);
          console.info("[trip-ledger] 微信分享已配置", shareData.appMessage.link);
        });

        window.wx.error((error) => {
          console.warn("[trip-ledger] 微信分享配置失败", error);
        });
      } catch (error) {
        console.warn("[trip-ledger] 微信分享初始化失败", error);
      }
    }

    void setupWechatShare();

    return () => {
      cancelled = true;
    };
  }, [description, imageUrl, link, priority, signatureEndpoint, title]);

  return null;
}

function createShareData({
  title,
  description,
  link,
  imageUrl,
}: {
  title: string;
  description: string;
  link: string;
  imageUrl: string;
}) {
  return {
    appMessage: {
      title,
      desc: description,
      link,
      imgUrl: imageUrl,
    },
    timeline: {
      title,
      link,
      imgUrl: imageUrl,
    },
  };
}

function applyWechatShareData(shareData: ReturnType<typeof createShareData>) {
  window.wx?.updateAppMessageShareData?.(shareData.appMessage);
  window.wx?.updateTimelineShareData?.(shareData.timeline);
  window.wx?.onMenuShareAppMessage?.(shareData.appMessage);
  window.wx?.onMenuShareTimeline?.(shareData.timeline);
  console.info("[trip-ledger] 微信分享已更新", shareData.appMessage.link);
}

function isWechatBrowser() {
  return /MicroMessenger/i.test(window.navigator.userAgent);
}

function loadWechatSdk() {
  if (window.wx) return Promise.resolve();

  return new Promise<void>((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>(`script[src="${wechatSdkUrl}"]`);
    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(), { once: true });
      existingScript.addEventListener("error", () => reject(new Error("微信 JS-SDK 加载失败")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = wechatSdkUrl;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("微信 JS-SDK 加载失败"));
    document.head.appendChild(script);
  });
}
