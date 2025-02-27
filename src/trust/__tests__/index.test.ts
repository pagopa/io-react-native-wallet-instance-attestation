// helper to assert type
const testType = <T>(_: T) => true;

import {
  CredentialIssuerEntityConfiguration,
  EntityConfiguration,
  RelyingPartyEntityConfiguration,
  TrustAnchorEntityConfiguration,
  WalletProviderEntityConfiguration,
} from "../types";
import {
  getCredentialIssuerEntityConfiguration,
  getEntityConfiguration,
  getRelyingPartyEntityConfiguration,
  getTrustAnchorEntityConfiguration,
  getWalletProviderEntityConfiguration,
  verifyTrustChain,
} from "..";
import {
  intermediateEntityStatement,
  leafEntityConfiguration,
  leafEntityStatement,
  signed,
  trustAnchorEntityConfiguration,
} from "../__mocks__/entity-statements";

import * as mockEC from "../__mocks__/entity-configurations";

describe("verifyTrustChain", () => {
  it("should throw on empty trust chain", async () => {
    await expect(
      verifyTrustChain(trustAnchorEntityConfiguration, [])
    ).rejects.toThrow();
  });

  it("should resolve a correct chain", async () => {
    const result = await verifyTrustChain(trustAnchorEntityConfiguration, [
      await signed(leafEntityConfiguration),
      await signed(leafEntityStatement),
      await signed(intermediateEntityStatement),
    ]);
    expect(result).toEqual([
      leafEntityConfiguration,
      leafEntityStatement,
      intermediateEntityStatement,
    ]);
  });

  it("should accept the trust anchor entity configuration as last element of the chain", async () => {
    const result = await verifyTrustChain(trustAnchorEntityConfiguration, [
      await signed(leafEntityConfiguration),
      await signed(leafEntityStatement),
      await signed(intermediateEntityStatement),
      await signed(trustAnchorEntityConfiguration),
    ]);
    expect(result).toEqual([
      leafEntityConfiguration,
      leafEntityStatement,
      intermediateEntityStatement,
      trustAnchorEntityConfiguration,
    ]);
  });

  it("should throw on invalid trust chain", async () => {
    await expect(
      verifyTrustChain(trustAnchorEntityConfiguration, [
        await signed(leafEntityConfiguration),
        await signed(leafEntityStatement),
        // missing required intermediate entity
      ])
    ).rejects.toThrow();
  });

  it("should throw on empty elements in trust chain", async () => {
    await expect(
      verifyTrustChain(trustAnchorEntityConfiguration, [
        await signed(leafEntityConfiguration),
        await signed(leafEntityStatement),
        "",
      ])
    ).rejects.toThrow();
  });

  it("should throw on invalid trust chain (unresolved trust)", async () => {
    const anotherTrustAnchor = {
      header: {
        typ: "entity-statement+jwt" as const,
        alg: "RS256",
        kid: "3vUQZOK8dViFClsFGd65Uc8gFWOLv74ylv0oU2tHIyQ",
      },
      payload: {
        iss: "https://another.trustanchor.example",
        sub: "https://another.trustanchor.example",
        jwks: {
          keys: [
            {
              kty: "RSA" as const,
              e: "AQAB",
              use: "sig",
              kid: "3vUQZOK8dViFClsFGd65Uc8gFWOLv74ylv0oU2tHIyQ",
              alg: "RS256",
              n: "6OtnC5VpTq_pYnQf--C2H1Je8s4QDymGZ4PIixt5R19WROkHksQExLYlSXU-NI7KvgjZvkSsoXVGslk9uZ_bY3kXCDe4Hb2zRMazwznCbjNbgz2kWrd32mj5s2KnLC9iUIuVuK6EPgMUSbVufUp3wYrNAbsAT2TUt5ZIkE9awVYaAR2nUVyIGucVag6kKu-Nd7mbMxeKFLO9glvaFWHBk6B1YtSXvY5d_bUxgLbu-cU9Zl5P4y0aiUw84bX0HraRl7R6WodIRnW7nzV4AOwU4GI2J3QUEodOMS-ZZQeCZSNs6lzBN2rMk0divgi2E4gIh0trwNciqSPcOc_qYbsubQ",
            },
          ],
        },
        metadata: {
          federation_entity: {
            organization_name: "another.trustanchor",
            homepage_uri: "https://another.trustanchor.example",
            policy_uri: "https://another.trustanchor.example",
            logo_uri: "https://another.trustanchor.example",
            contacts: ["https://another.trustanchor.example"],
          },
        },
        authority_hints: [],
        iat: Date.now(),
        exp: 1849623968, // 11/2/2028
      },
    };
    await expect(
      verifyTrustChain(anotherTrustAnchor, [
        await signed(leafEntityConfiguration),
        await signed(leafEntityStatement),
        await signed(intermediateEntityStatement),
      ])
    ).rejects.toThrow();
  });
});

describe("EntityConfiguration", () => {
  it("should not strip unknown metadata fields", () => {
    const withAdditionalField = {
      header: leafEntityConfiguration.header,
      payload: {
        ...leafEntityConfiguration.payload,
        metadata: {
          ...leafEntityConfiguration.payload.metadata,
          additional_field: "foo",
        },
      },
    };

    const parsed = EntityConfiguration.parse(withAdditionalField);

    expect(parsed.payload.metadata.additional_field).toEqual(
      withAdditionalField.payload.metadata.additional_field
    );
  });
});

// helper to get a fetch instance that returns a static value
const fetchAlways = <T>(status: number, value: T) =>
  (async () => ({
    status,
    text: () => Promise.resolve(value),
  })) as unknown as GlobalFetch["fetch"];

describe("getEntityConfiguration", () => {
  it("should fetch a valid trust anchor entity configuration", async () => {
    const result = await getTrustAnchorEntityConfiguration(
      "https://example.com",
      {
        appFetch: fetchAlways(200, mockEC.trustAnchorSignedEntityConfiguration),
      }
    );

    // ok
    testType<TrustAnchorEntityConfiguration>(result);
    // @ts-expect-error because incompatible types
    testType<WalletProviderEntityConfiguration>(result);
    // TrustAnchorEntityConfiguration is also a EntityConfiguration
    testType<EntityConfiguration>(result);

    expect(result).toBeDefined();
  });

  it("should fetch a valid wallet provider entity configuration", async () => {
    const result = await getWalletProviderEntityConfiguration(
      "https://example.com",
      {
        appFetch: fetchAlways(
          200,
          mockEC.walletProviderSignedEntityConfiguration
        ),
      }
    );

    // OK
    testType<WalletProviderEntityConfiguration>(result);
    // OK because the type TrustAnchorEntityConfiguration contains WalletProviderEntityConfiguration
    testType<TrustAnchorEntityConfiguration>(result);
    // OK: TrustAnchorEntityConfiguration is also a EntityConfiguration
    testType<EntityConfiguration>(result);

    expect(result).toBeDefined();
  });

  it("should fetch a valid credential provider entity configuration", async () => {
    const result = await getCredentialIssuerEntityConfiguration(
      "https://example.com",
      {
        appFetch: fetchAlways(
          200,
          mockEC.credentialProviderSignedEntityConfiguration
        ),
      }
    );

    // OK
    testType<CredentialIssuerEntityConfiguration>(result);
    // OK because the type TrustAnchorEntityConfiguration contains WalletProviderEntityConfiguration
    testType<TrustAnchorEntityConfiguration>(result);
    // OK: TrustAnchorEntityConfiguration is also a EntityConfiguration
    testType<EntityConfiguration>(result);
    // @ts-expect-error because the type CredentialIssuerEntityConfiguration is not compatible with WalletProviderEntityConfiguration
    testType<WalletProviderEntityConfiguration>(result);

    expect(result).toBeDefined();
  });

  it("should fetch a valid relying party entity configuration", async () => {
    const result = await getRelyingPartyEntityConfiguration(
      "https://example.com",
      {
        appFetch: fetchAlways(
          200,
          mockEC.relyingPartySignedEntityConfiguration
        ),
      }
    );

    // OK
    testType<RelyingPartyEntityConfiguration>(result);
    // OK because the type TrustAnchorEntityConfiguration contains WalletProviderEntityConfiguration
    testType<TrustAnchorEntityConfiguration>(result);
    // OK: TrustAnchorEntityConfiguration is also a EntityConfiguration
    testType<EntityConfiguration>(result);
    // @ts-expect-error because the type RelyingPartyEntityConfiguration is not compatible with WalletProviderEntityConfiguration
    testType<WalletProviderEntityConfiguration>(result);

    expect(result).toBeDefined();
  });

  it("should accept a generic entity configuration", async () => {
    const result = await getEntityConfiguration("https://example.com", {
      appFetch: fetchAlways(
        200,
        /* any EC will do */ mockEC.relyingPartySignedEntityConfiguration
      ),
    });

    // @ts-expect-error because the type is not narrowed
    testType<RelyingPartyEntityConfiguration>(result);

    expect(result).toBeDefined();
  });

  it.failing("when an invalid entity configuration is provided", async () => {
    const result = await getEntityConfiguration("https://example.com", {
      appFetch: fetchAlways(200, { invalid: true }),
    });

    // @ts-expect-error because the type is not narrowed
    testType<RelyingPartyEntityConfiguration>(result);

    expect(result).toBeDefined();
  });

  it.failing(
    "when an entity configuration whose type do not matches is provided",
    async () => {
      const result = await getWalletProviderEntityConfiguration(
        "https://example.com",
        {
          appFetch: fetchAlways(
            200,
            // expecting to fetch a Wallet Provider EC, retrieving a Reying Party one
            mockEC.relyingPartySignedEntityConfiguration
          ),
        }
      );

      expect(result).toBeDefined();
    }
  );
});
