import { fetchPresentDefinition } from "../06-fetch-presentation-definition";
import { PresentationDefinition, RequestObject } from "../types";
import { RelyingPartyEntityConfiguration } from "../../../trust/types";

describe("fetchPresentDefinition", () => {
  let originalFetch: typeof global.fetch;

  beforeAll(() => {
    // Save the original fetch so we can restore it later
    originalFetch = global.fetch;
  });

  beforeEach(() => {
    // Replace global.fetch with a Jest mock
    global.fetch = jest.fn();
  });

  afterAll(() => {
    // Restore the original fetch after all tests
    global.fetch = originalFetch;
  });

  it("returns the presentationDefinition from the request object if present", async () => {
    const mockRequestObject = {
      presentation_definition: {
        id: "test-direct",
      } as unknown as PresentationDefinition,
    } as unknown as RequestObject;

    const result = await fetchPresentDefinition(mockRequestObject);

    expect(result.presentationDefinition.id).toBe("test-direct");
  });

  it("fetches the presentationDefinition from the provided URI if present", async () => {
    // Mock a valid response from the fetch call
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: "test-fetched",
        input_descriptors: [{ id: "id", constraints: {} }],
      }),
    } as Response);

    const mockRequestObject = {} as unknown as RequestObject;

    const mockRpConf = {
      openid_credential_verifier: {
        presentation_definition_uri:
          "https://example.com/presentation-definition.json",
      },
    } as unknown as RelyingPartyEntityConfiguration["payload"]["metadata"];

    const result = await fetchPresentDefinition(
      mockRequestObject,
      {},
      mockRpConf
    );

    // Ensure the fetch was called with the correct URI
    expect(global.fetch).toHaveBeenCalledWith(
      "https://example.com/presentation-definition.json",
      { method: "GET" }
    );
    expect(result.presentationDefinition.id).toBe("test-fetched");
  });

  it("throws an error when fetch fails for the provided URI", async () => {
    // Mock a failed response
    (global.fetch as jest.Mock).mockRejectedValue(new Error("Network error"));

    const mockRequestObject = {} as unknown as RequestObject;

    const mockRpConf = {
      openid_credential_verifier: {
        presentation_definition_uri:
          "https://example.com/presentation-definition.json",
      },
    } as unknown as RelyingPartyEntityConfiguration["payload"]["metadata"];

    await expect(
      fetchPresentDefinition(mockRequestObject, {}, mockRpConf)
    ).rejects.toThrow();
  });

  it("returns the pre-configured presentationDefinition if 'scope' exists and no URI is provided", async () => {
    const mockRequestObject = {
      scope: "openid",
    } as unknown as RequestObject;

    const mockRpConf: RelyingPartyEntityConfiguration["payload"]["metadata"] = {
      openid_credential_verifier: {
        presentation_definition: {
          id: "test-preconfigured",
        } as unknown as PresentationDefinition,
      },
    } as unknown as RelyingPartyEntityConfiguration["payload"]["metadata"];

    const result = await fetchPresentDefinition(
      mockRequestObject,
      {},
      mockRpConf
    );

    expect(result.presentationDefinition.id).toBe("test-preconfigured");
  });

  it("throws an error if no presentation definition can be found", async () => {
    const mockRequestObject = {} as unknown as RequestObject;

    await expect(fetchPresentDefinition(mockRequestObject)).rejects.toThrow(
      "Presentation definition not found"
    );
  });
});
