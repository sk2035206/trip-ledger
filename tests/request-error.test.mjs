import assert from "node:assert/strict";
import test from "node:test";
import { requestErrorMessage } from "../frontend/request-error.ts";
test("plain WeChat errors distinguish domain permissions, timeouts and TLS failures", () => {
  assert.match(
    requestErrorMessage(
      { errMsg: "request:fail url not in domain list" },
      "http://localhost:5174",
    ),
    /合法域名/,
  );
  assert.match(
    requestErrorMessage(
      { errMsg: "request:fail timeout" },
      "https://example.com",
    ),
    /超时/,
  );
  assert.match(
    requestErrorMessage(
      { errMsg: "request:fail ssl hand shake error" },
      "https://example.com",
    ),
    /证书/,
  );
});
test("loopback connection failures explain the local service and real device distinction", () => {
  for (const base of [
    "http://127.0.0.1:5174",
    "http://localhost:5174",
    "http://[::1]:5174",
  ]) {
    assert.match(
      requestErrorMessage(
        { errMsg: "request:fail ERR_CONNECTION_REFUSED" },
        base,
      ),
      /API 已启动/,
    );
  }
  assert.match(
    requestErrorMessage(
      { errMsg: "request:fail ERR_CONNECTION_REFUSED" },
      "https://example.com",
    ),
    /ERR_CONNECTION_REFUSED/,
  );
});
test("standard Errors and unknown rejection values remain readable", () => {
  assert.match(
    requestErrorMessage(new Error("network offline"), "https://example.com"),
    /network offline/,
  );
  assert.match(
    requestErrorMessage(null, "https://example.com"),
    /检查后端地址/,
  );
});
