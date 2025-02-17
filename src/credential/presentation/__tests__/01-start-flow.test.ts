// startFlow.test.ts
import { ValidationFailed } from "../../../utils/errors";
import { startFlowFromQR } from "../01-start-flow";

describe("startFlowFromQR", () => {
  const requestUri = "https://request.uri";
  const clientId = "client123";
  const requestUriMethod = "get";
  const state = "state123";

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should successfully decode a valid QR code", () => {
    const result = startFlowFromQR({
      requestUri,
      clientId,
      requestUriMethod,
      state,
    });

    expect(result).toEqual({
      requestUri,
      clientId,
      requestUriMethod,
      state,
    });
  });

  it("should throw InvalidQRCodeError for invalid request_uri ", () => {
    expect(() =>
      startFlowFromQR({ requestUri: "test", requestUriMethod, clientId })
    ).toThrow(ValidationFailed);
  });

  it("should throw InvalidQRCodeError for invalid client_id", () => {
    expect(() =>
      startFlowFromQR({ requestUri, requestUriMethod, clientId: "" })
    ).toThrow(ValidationFailed);
  });
});
