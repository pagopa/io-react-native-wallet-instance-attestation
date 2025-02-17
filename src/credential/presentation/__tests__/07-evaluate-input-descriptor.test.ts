// __tests__/evaluateInputDescriptorForSdJwt4VC.test.ts

import { evaluateInputDescriptorForSdJwt4VC } from "../07-evaluate-input-descriptor";
import { InputDescriptor } from "../types";
import {
  type SdJwt4VC,
  type DisclosureWithEncoded,
} from "../../../sd-jwt/types";

describe("evaluateInputDescriptorForSdJwt4VC", () => {
  it("should return all disclosures if constraints.fields is not present", () => {
    const inputDescriptor: InputDescriptor = {
      // constraints is undefined or empty
      id: "testDescriptor",
      name: "test",
    } as unknown as InputDescriptor;

    const payloadCredential: SdJwt4VC["payload"] = {
      // minimal payload
      sub: "1234567890",
      iss: "issuer",
      iat: 1609459200,
    } as unknown as SdJwt4VC["payload"];

    const disclosures: DisclosureWithEncoded[] = [
      {
        decoded: ["1", "given_name", "John"],
        encoded: "encoded1",
      },
      {
        decoded: ["1", "family_name", "Doe"],
        encoded: "encoded2",
      },
    ];

    const { unrequestedDisclosures } = evaluateInputDescriptorForSdJwt4VC(
      inputDescriptor,
      payloadCredential,
      disclosures
    );
    expect(unrequestedDisclosures).toEqual(disclosures);
  });

  it("should throw an error if a required field path does not exist", () => {
    const inputDescriptor: InputDescriptor = {
      id: "testDescriptor",
      name: "test",
      constraints: {
        fields: [
          {
            path: ["$.missing_name"],
            optional: false, // Not optional
          },
        ],
      },
    };

    const payloadCredential: SdJwt4VC["payload"] = {
      sub: "1234567890",
      iss: "issuer",
      iat: 1609459200,
    } as unknown as SdJwt4VC["payload"];

    const disclosures: DisclosureWithEncoded[] = [
      {
        decoded: ["1", "given_name", "John"],
        encoded: "encoded1",
      },
    ];

    expect(() =>
      evaluateInputDescriptorForSdJwt4VC(
        inputDescriptor,
        payloadCredential,
        disclosures
      )
    ).toThrow(); // Required field not satisfied
  });

  it("should pass if a field path does not exist but is optional", () => {
    const inputDescriptor: InputDescriptor = {
      id: "testDescriptor",
      name: "test",
      constraints: {
        fields: [
          {
            path: ["$.nonexistent_field"],
            optional: true,
          },
        ],
      },
    };

    const payloadCredential: SdJwt4VC["payload"] = {
      sub: "1234567890",
      iss: "issuer",
      iat: 1609459200,
    } as unknown as SdJwt4VC["payload"];

    const disclosures: DisclosureWithEncoded[] = [
      {
        decoded: ["1", "given_name", "John"],
        encoded: "encoded1",
      },
    ];

    const { unrequestedDisclosures } = evaluateInputDescriptorForSdJwt4VC(
      inputDescriptor,
      payloadCredential,
      disclosures
    );
    // Because the field is optional, we keep the original disclosures
    expect(unrequestedDisclosures).toEqual(disclosures);
  });

  it("should pass if a field path required and another is optional", () => {
    const inputDescriptor: InputDescriptor = {
      id: "testDescriptor",
      name: "test",
      constraints: {
        fields: [
          {
            path: ["$.given_name"],
            optional: true,
          },
          {
            path: ["$.family_name"],
          },
        ],
      },
    };

    const payloadCredential: SdJwt4VC["payload"] = {
      sub: "1234567890",
      iss: "issuer",
      iat: 1609459200,
    } as unknown as SdJwt4VC["payload"];

    const disclosures: DisclosureWithEncoded[] = [
      {
        decoded: ["1", "given_name", "John"],
        encoded: "encoded1",
      },
      {
        decoded: ["2", "family_name", "Smith"],
        encoded: "encoded2",
      },
    ];

    const { requiredDisclosures, optionalDisclosures, unrequestedDisclosures } =
      evaluateInputDescriptorForSdJwt4VC(
        inputDescriptor,
        payloadCredential,
        disclosures
      );
    // Because the field is optional, we keep the original disclosures
    expect(requiredDisclosures).toEqual([disclosures[1]]);
    expect(optionalDisclosures).toEqual([disclosures[0]]);
    expect(unrequestedDisclosures).toEqual([]);
  });

  it("should throw an error if filter (JSON Schema) validation fails", () => {
    const inputDescriptor: InputDescriptor = {
      id: "testDescriptor",
      name: "test",
      constraints: {
        fields: [
          {
            path: ["$.age"],
            optional: false,
            // JSON Schema requiring a minimum age of 21
            filter: {
              type: "number",
              minimum: 21,
            },
          },
        ],
      },
    };

    const payloadCredential: SdJwt4VC["payload"] = {
      sub: "1234567890",
      iss: "issuer",
      iat: 1609459200,
    } as unknown as SdJwt4VC["payload"];

    const disclosures: DisclosureWithEncoded[] = [
      {
        decoded: ["1", "age", 20],
        encoded: "encoded1",
      },
    ];

    expect(() =>
      evaluateInputDescriptorForSdJwt4VC(
        inputDescriptor,
        payloadCredential,
        disclosures
      )
    ).toThrow(); // Fails JSON schema validation
  });

  it("should keep disclosures if filter (JSON Schema) validation succeeds", async () => {
    const inputDescriptor: InputDescriptor = {
      id: "testDescriptor",
      name: "test",
      constraints: {
        fields: [
          {
            path: ["$.age"],
            optional: false,
            // JSON Schema requiring a minimum age of 21
            filter: {
              type: "number",
              minimum: 21,
            },
          },
        ],
      },
    };

    const payloadCredential: SdJwt4VC["payload"] = {
      sub: "1234567890",
      iss: "issuer",
      iat: 1609459200,
    } as unknown as SdJwt4VC["payload"];

    const disclosures: DisclosureWithEncoded[] = [
      {
        decoded: ["1", "age", 25],
        encoded: "encoded1",
      },
    ];

    const { requiredDisclosures } = evaluateInputDescriptorForSdJwt4VC(
      inputDescriptor,
      payloadCredential,
      disclosures
    );

    expect(requiredDisclosures).toStrictEqual(disclosures);
  });

  it("should limit disclosures if limit_disclosure is 'required'", () => {
    const inputDescriptor: InputDescriptor = {
      id: "testDescriptor",
      name: "test",
      constraints: {
        limit_disclosure: "required",
        fields: [
          {
            path: ["$.given_name"],
          },
        ],
      },
    };

    const payloadCredential: SdJwt4VC["payload"] = {
      sub: "1234567890",
      iss: "issuer",
      iat: 1609459200,
    } as unknown as SdJwt4VC["payload"];

    const disclosures: DisclosureWithEncoded[] = [
      {
        decoded: ["1", "given_name", "John"],
        encoded: "encodedGivenName",
      },
      {
        decoded: ["1", "family_name", "Doe"],
        encoded: "encodedFamilyName",
      },
    ];

    const { requiredDisclosures, unrequestedDisclosures } =
      evaluateInputDescriptorForSdJwt4VC(
        inputDescriptor,
        payloadCredential,
        disclosures
      );

    // Should only keep the disclosures for given_name
    const expected = [
      {
        decoded: ["1", "given_name", "John"],
        encoded: "encodedGivenName",
      },
    ];

    expect(requiredDisclosures).toStrictEqual(expected);
    expect(unrequestedDisclosures).toStrictEqual([]);
  });

  it("should return all disclosures if limit_disclosure is not set or not 'required'", () => {
    const inputDescriptor: InputDescriptor = {
      id: "testDescriptor",
      name: "test",
      constraints: {
        fields: [
          {
            path: ["$.given_name"],
            optional: false,
          },
        ],
      },
    };

    const payloadCredential: SdJwt4VC["payload"] = {
      sub: "1234567890",
      iss: "issuer",
      iat: 1609459200,
    } as unknown as SdJwt4VC["payload"];

    const disclosures: DisclosureWithEncoded[] = [
      {
        decoded: ["1", "given_name", "John"],
        encoded: "encodedGivenName",
      },
      {
        decoded: ["1", "family_name", "Doe"],
        encoded: "encodedFamilyName",
      },
    ];

    // limit_disclosure is undefined or not "required", so we return all disclosures
    const { requiredDisclosures, unrequestedDisclosures } =
      evaluateInputDescriptorForSdJwt4VC(
        inputDescriptor,
        payloadCredential,
        disclosures
      );
    expect(requiredDisclosures).toEqual([disclosures[0]]);
    expect(unrequestedDisclosures).toEqual([disclosures[1]]);
  });
});
