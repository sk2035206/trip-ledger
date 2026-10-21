// WeChat rejects network requests with plain { errMsg } objects, not Error instances.
export function requestErrorMessage(error: unknown, apiBase: string): string {
  const detail =
    error instanceof Error
      ? error.message
      : error &&
          typeof error === "object" &&
          "errMsg" in error &&
          typeof error.errMsg === "string"
        ? error.errMsg
        : typeof error === "string"
          ? error
          : "";
  if (
    /url not in domain list|不在.*合法域名|domain.*not.*allowed/i.test(detail)
  ) {
    return "请求域名未通过微信校验，请配置 request 合法域名；本地开发可在开发者工具中关闭域名校验";
  }
  if (/timeout|timed out|超时/i.test(detail))
    return "连接后端超时，请确认服务可访问后重试";
  if (/ssl|certificate|cert_|tls/i.test(detail))
    return "HTTPS 连接失败，请检查服务证书是否有效";
  if (/^http:\/\/(127\.0\.0\.1|localhost|\[::1\])(?=[:/]|$)/i.test(apiBase)) {
    return "本地后端连接失败，请确认电脑上的 API 已启动；手机调试需使用可访问的服务地址";
  }
  return detail
    ? `连接失败：${detail.slice(0, 300)}`
    : "连接失败，请检查后端地址和网络后重试";
}
