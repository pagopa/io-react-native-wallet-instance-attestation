// __tests__/evaluateRelyingPartyTrust.test.ts

import { evaluateRelyingPartyTrust } from "../02-evaluate-rp-trust";
import { getRelyingPartyEntityConfiguration } from "../../../trust";
import { RelyingPartyEntityConfiguration } from "../../../trust/types";

// Mock the getRelyingPartyEntityConfiguration module
jest.mock("../../../trust", () => ({
  getRelyingPartyEntityConfiguration: jest.fn(),
}));

const mockedGetRelyingPartyEntityConfiguration =
  getRelyingPartyEntityConfiguration as jest.MockedFunction<
    typeof getRelyingPartyEntityConfiguration
  >;

describe("evaluateRelyingPartyTrust", () => {
  const sampleRpUrl = "https://example.com/rp";
  const sampleMetadata = {
    // Populate with sample metadata as per RelyingPartyEntityConfiguration["payload"]["metadata"]
    name: "Example RP",
    version: "1.0",
    // ... other metadata fields
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should fetch and return the Relying Party configuration", async () => {
    // Arrange: Mock the getRelyingPartyEntityConfiguration to return a resolved promise
    mockedGetRelyingPartyEntityConfiguration.mockResolvedValue({
      payload: {
        metadata: sampleMetadata,
      },
    } as unknown as RelyingPartyEntityConfiguration);

    // Act: Call the function under test
    const result = await evaluateRelyingPartyTrust(sampleRpUrl);

    // Assert: Check that getRelyingPartyEntityConfiguration was called correctly
    expect(getRelyingPartyEntityConfiguration).toHaveBeenCalledWith(
      sampleRpUrl,
      {
        appFetch: expect.any(Function),
      }
    );

    // Assert: Check that the result contains the expected metadata
    expect(result).toEqual({ rpConf: sampleMetadata });
  });

  it("should use a custom fetch implementation when provided", async () => {
    // Arrange: Create a mock fetch function
    const customFetch = jest.fn().mockResolvedValue(new Response());

    mockedGetRelyingPartyEntityConfiguration.mockResolvedValue({
      payload: {
        metadata: sampleMetadata,
      },
    } as unknown as RelyingPartyEntityConfiguration);

    // Act: Call the function with a custom fetch
    const result = await evaluateRelyingPartyTrust(sampleRpUrl, {
      appFetch: customFetch,
    });

    // Assert: Check that getRelyingPartyEntityConfiguration was called with the custom fetch
    expect(getRelyingPartyEntityConfiguration).toHaveBeenCalledWith(
      sampleRpUrl,
      {
        appFetch: customFetch,
      }
    );

    expect(result).toEqual({ rpConf: sampleMetadata });
  });

  it("should propagate errors from getRelyingPartyEntityConfiguration", async () => {
    // Arrange: Mock getRelyingPartyEntityConfiguration to reject with an error
    const error = new Error("Failed to fetch RP configuration");
    mockedGetRelyingPartyEntityConfiguration.mockRejectedValue(error);

    // Act & Assert: Expect the function to reject with the same error
    await expect(evaluateRelyingPartyTrust(sampleRpUrl)).rejects.toThrow(
      "Failed to fetch RP configuration"
    );

    // Assert: Ensure getRelyingPartyEntityConfiguration was called
    expect(getRelyingPartyEntityConfiguration).toHaveBeenCalledWith(
      sampleRpUrl,
      {
        appFetch: expect.any(Function),
      }
    );
  });

  it("should use the default fetch when no context is provided", async () => {
    // Arrange: Spy on the global fetch
    const globalFetchSpy = jest
      .spyOn(global, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ payload: { metadata: sampleMetadata } }))
      );

    mockedGetRelyingPartyEntityConfiguration.mockResolvedValue({
      payload: {
        metadata: sampleMetadata,
      },
    } as unknown as RelyingPartyEntityConfiguration);

    // Act: Call the function without context
    const result = await evaluateRelyingPartyTrust(sampleRpUrl);

    expect(getRelyingPartyEntityConfiguration).toHaveBeenCalledWith(
      sampleRpUrl,
      {
        appFetch: global.fetch,
      }
    );

    expect(result).toEqual({ rpConf: sampleMetadata });

    globalFetchSpy.mockRestore();
  });
});
