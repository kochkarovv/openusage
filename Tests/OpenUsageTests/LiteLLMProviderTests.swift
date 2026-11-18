import XCTest
@testable import OpenUsage

final class LiteLLMAuthStoreTests: XCTestCase {
    private let path = LiteLLMAuthStore.configPaths[0]

    func testHostNormalization() {
        let cases: [(String, String?)] = [
            ("litellm.corp/", "https://litellm.corp"),
            ("http://localhost:4000", "http://localhost:4000"),
            ("https://gw.corp/litellm/v1/", "https://gw.corp/litellm"),
            ("  https://proxy.example.com  ", "https://proxy.example.com"),
            ("ftp://proxy.example.com", nil),
            ("https://", nil),
            ("", nil)
        ]
        for (raw, expected) in cases {
            XCTAssertEqual(LiteLLMAuthStore.normalizedHost(raw)?.absoluteString, expected, raw)
        }
    }

    func testKeyAndHostSurviveEachOthersSaveAndDelete() throws {
        let files = FakeFiles()
        let store = LiteLLMAuthStore(files: files, environment: FakeEnvironment())

        try store.saveHost("litellm.corp")
        try store.saveAPIKey("sk-1")
        XCTAssertEqual(try store.loadAuth(), LiteLLMAuth(apiKey: "sk-1", baseURL: URL(string: "https://litellm.corp")!))

        try store.saveHost("http://localhost:4000")
        XCTAssertEqual(store.currentAPIKey(), "sk-1")

        try store.deleteAPIKey()
        XCTAssertNil(store.currentAPIKey())
        XCTAssertEqual(store.currentHost(), "http://localhost:4000")
        XCTAssertEqual(files.files[path], #"{"host":"http:\/\/localhost:4000"}"#)

        try store.saveHost("")
        XCTAssertNil(files.files[path], "an emptied config file is removed")
    }

    func testLoadAuthReportsWhatIsMissing() {
        let env = FakeEnvironment(["LITELLM_API_KEY": "sk-env"])
        XCTAssertThrowsError(try LiteLLMAuthStore(files: FakeFiles(), environment: FakeEnvironment()).loadAuth()) {
            XCTAssertEqual($0 as? LiteLLMAuthError, .missingKey)
        }
        XCTAssertThrowsError(try LiteLLMAuthStore(files: FakeFiles(), environment: env).loadAuth()) {
            XCTAssertEqual($0 as? LiteLLMAuthError, .missingHost)
        }
        let withHost = FakeEnvironment(["LITELLM_API_KEY": "sk-env", "LITELLM_API_BASE": "https://env.host"])
        XCTAssertEqual(try LiteLLMAuthStore(files: FakeFiles(), environment: withHost).loadAuth().baseURL.host, "env.host")
    }
}

final class LiteLLMProviderTests: XCTestCase {
    func testBudgetKeyMapsMeterSpendAndAlias() async throws {
        let http = RoutingHTTPClient { request in
            XCTAssertEqual(request.url.absoluteString, "https://gw.corp/litellm/key/info")
            XCTAssertEqual(request.headers["Authorization"], "Bearer sk-test")
            return response(#"{"key":"sk-...test","info":{"spend":12.5,"max_budget":50,"key_alias":"vlad","budget_reset_at":"2026-12-01T00:00:00.123456+00:00"}}"#)
        }
        let snapshot = await makeProvider(http).refresh()

        XCTAssertEqual(snapshot.plan, "vlad")
        guard case .progress(_, let used, let limit, _, let resetsAt, _, _) = snapshot.line(label: "Budget") else {
            return XCTFail("missing Budget meter")
        }
        XCTAssertEqual(used, 12.5)
        XCTAssertEqual(limit, 50)
        XCTAssertEqual(resetsAt, OpenUsageISO8601.date(from: "2026-12-01T00:00:00.123Z"))
        XCTAssertNotNil(snapshot.line(label: "Spend"))
    }

    func testUncappedKeyShowsSpendOnly() async {
        let snapshot = await makeProvider(RoutingHTTPClient { _ in
            response(#"{"spend":3.2,"max_budget":null}"#)
        }).refresh()

        XCTAssertNil(snapshot.line(label: "Budget"))
        guard case .values(_, let values, _, _, _, _) = snapshot.line(label: "Spend") else {
            return XCTFail("missing Spend")
        }
        XCTAssertEqual(values.first?.number, 3.2)
    }

    func testRouteRestrictedKeyFallsBackToSpendHeaders() async {
        // Real proxy shape: `/key/info` is 403 for keys limited to `llm_api_routes`, but the free probe's
        // 400 still carries the key's spend and budget headers.
        let http = RoutingHTTPClient { request in
            if request.url.path.hasSuffix("/key/info") { return HTTPResponse(statusCode: 403, headers: [:], body: Data()) }
            XCTAssertEqual(request.url.absoluteString, "https://gw.corp/litellm/v1/chat/completions")
            XCTAssertEqual(request.method, "POST")
            return HTTPResponse(statusCode: 400, headers: [
                "x-litellm-response-cost": "0",
                "x-litellm-key-spend": "16.250468804999993",
                "x-litellm-key-max-budget": "200.0"
            ], body: Data())
        }
        let snapshot = await makeProvider(http).refresh()

        XCTAssertNil(snapshot.errorCategory)
        guard case .progress(_, let used, let limit, _, _, _, _) = snapshot.line(label: "Budget") else {
            return XCTFail("missing Budget meter")
        }
        XCTAssertEqual(used, 16.250468804999993)
        XCTAssertEqual(limit, 200)
    }

    func testAuthFailuresAreDistinct() async {
        let invalid = await makeProvider(RoutingHTTPClient { _ in
            HTTPResponse(statusCode: 401, headers: [:], body: Data())
        }).refresh()
        XCTAssertEqual(invalid.errorCategory, LiteLLMAuthError.invalidKey.errorCategory)

        // 403 everywhere and no spend headers: nothing to show, so say the key can't read its usage.
        let forbidden = await makeProvider(RoutingHTTPClient { _ in
            HTTPResponse(statusCode: 403, headers: [:], body: Data())
        }).refresh()
        XCTAssertEqual(forbidden.errorCategory, LiteLLMAuthError.forbidden.errorCategory)
    }

    private func makeProvider(_ http: RoutingHTTPClient) -> LiteLLMProvider {
        LiteLLMProvider(
            authStore: LiteLLMAuthStore(files: FakeFiles([
                LiteLLMAuthStore.configPaths[0]: #"{"apiKey":"sk-test","host":"https://gw.corp/litellm"}"#
            ]), environment: FakeEnvironment()),
            usageClient: LiteLLMUsageClient(http: http)
        )
    }
}

private func response(_ json: String) -> HTTPResponse {
    HTTPResponse(statusCode: 200, headers: [:], body: Data(json.utf8))
}
