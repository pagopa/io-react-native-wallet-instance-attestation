import type { Out } from "../../utils/misc";
import type { EvaluateIssuerTrust } from "./02-evaluate-issuer-trust";
import { IoWalletError } from "../../utils/errors";
import { SdJwt4VC } from "../../sd-jwt/types";
import { verify as verifySdJwt } from "../../sd-jwt";
import type { JWK } from "../../utils/jwk";
import type { CryptoContext } from "@pagopa/io-react-native-jwt";
import type { ObtainCredential } from "./06-obtain-credential";

export type VerifyAndParseCredential = (
  issuerConf: Out<EvaluateIssuerTrust>["issuerConf"],
  credential: Out<ObtainCredential>["credential"],
  format: Out<ObtainCredential>["format"],
  context: {
    credentialCryptoContext: CryptoContext;
    ignoreMissingAttributes?: boolean;
  }
) => Promise<{ parsedCredential: ParsedCredential }>;

// The credential as a collection of attributes in plain value
type ParsedCredential = Record<
  /** Attribute key */
  string,
  {
    /** Human-readable name of the attribute */
    name:
      | /* if i18n is provided */ Record<
          string /* locale */,
          string /* value */
        >
      | /* if no i18n is provided */ string
      | undefined; // Add undefined as a possible value for the name property
    /** The actual value of the attribute */
    value: unknown;
  }
>;

// handy alias
type DecodedSdJwtCredential = Out<typeof verifySdJwt> & {
  sdJwt: SdJwt4VC;
};

const parseCredentialSdJwt = (
  // the list of supported credentials, as defined in the issuer configuration
  credentials_supported: Out<EvaluateIssuerTrust>["issuerConf"]["openid_credential_issuer"]["credential_configurations_supported"],
  { sdJwt, disclosures }: DecodedSdJwtCredential,
  ignoreMissingAttributes: boolean = false
): ParsedCredential => {
  console.log("******* credentials_supported *******");
  console.log(JSON.stringify(credentials_supported));
  const credentialSubject = credentials_supported[sdJwt.payload.vct];

  if (!credentialSubject) {
    throw new IoWalletError("Credential type not supported by the issuer");
  }

  if (credentialSubject.format !== sdJwt.header.typ) {
    throw new IoWalletError(
      `Received credential is of an unknwown type. Expected one of [${credentialSubject.format}], received '${sdJwt.header.typ}', `
    );
  }

  // transfrom a record { key: value } in an iterable of pairs [key, value]
  const attrDefinitions = Object.entries(credentialSubject.claims);

  // the key of the attribute defintion must match the disclosure's name
  const attrsNotInDisclosures = attrDefinitions.filter(
    ([attrKey]) => !disclosures.some(([, name]) => name === attrKey)
  );
  if (attrsNotInDisclosures.length > 0) {
    const missing = attrsNotInDisclosures.map((_) => _[0 /* key */]).join(", ");
    const received = disclosures.map((_) => _[1 /* name */]).join(", ");
    if (!ignoreMissingAttributes) {
      throw new IoWalletError(
        `Some attributes are missing in the credential. Missing: [${missing}], received: [${received}]`
      );
    }
  }

  // attributes that are defined in the issuer configuration
  // and are present in the disclosure set
  const definedValues = Object.fromEntries(
    attrDefinitions
      // retrieve the value from the disclosure set
      .map(
        ([attrKey, definition]) =>
          [
            attrKey,
            {
              ...definition,
              value: disclosures.find(
                (_) => _[1 /* name */] === attrKey
              )?.[2 /* value */],
            },
          ] as const
      )
      // add a human readable attribute name, with i18n, in the form { locale: name }
      // example: { "it-IT": "Nome", "en-EN": "Name", "es-ES": "Nombre" }
      .map(
        ([attrKey, { display, ...definition }]) =>
          [
            attrKey,
            {
              ...definition,
              name: display.reduce(
                (names, { locale, name }) => ({ ...names, [locale]: name }),
                {} as Record<string, string>
              ),
            },
          ] as const
      )
  );

  // attributes that are in the disclosure set
  // but are not defined in the issuer configuration
  const undefinedValues = Object.fromEntries(
    disclosures
      .filter((_) => !Object.keys(definedValues).includes(_[1]))
      .map(([, key, value]) => [key, { value, name: key }])
  );

  return {
    ...definedValues,
    ...undefinedValues,
  };
};

/**
 * Given a credential, verify it's in the supported format
 * and the credential is correctly signed
 * and it's bound to the given key
 *
 * @param rawCredential The received credential
 * @param issuerKeys The set of public keys of the issuer,
 * which will be used to verify the signature
 * @param holderBindingContext The access to the holder's key
 *
 * @throws If the signature verification fails
 * @throws If the credential is not in the SdJwt4VC format
 * @throws If the holder binding is not properly configured
 *
 */
async function verifyCredentialSdJwt(
  rawCredential: string,
  issuerKeys: JWK[],
  holderBindingContext: CryptoContext
): Promise<DecodedSdJwtCredential> {
  const [decodedCredential, holderBindingKey] =
    // parallel for optimization
    await Promise.all([
      verifySdJwt(rawCredential, issuerKeys, SdJwt4VC),
      holderBindingContext.getPublicKey(),
    ]);

  const { cnf } = decodedCredential.sdJwt.payload;

  if (!cnf.jwk.kid || cnf.jwk.kid !== holderBindingKey.kid) {
    throw new IoWalletError(
      `Failed to verify holder binding, expected kid: ${holderBindingKey.kid}, got: ${decodedCredential.sdJwt.payload.cnf.jwk.kid}`
    );
  }

  return decodedCredential;
}

// utility type that specialize VerifyAndParseCredential for given format
type WithFormat<Format extends Parameters<VerifyAndParseCredential>[2]> = (
  _0: Parameters<VerifyAndParseCredential>[0],
  _1: Parameters<VerifyAndParseCredential>[1],
  _2: Format,
  _3: Parameters<VerifyAndParseCredential>[3]
) => ReturnType<VerifyAndParseCredential>;

const verifyAndParseCredentialSdJwt: WithFormat<"vc+sd-jwt"> = async (
  issuerConf,
  credential,
  _,
  { credentialCryptoContext, ignoreMissingAttributes }
) => {
  const decoded = await verifyCredentialSdJwt(
    credential,
    issuerConf.openid_credential_issuer.jwks.keys,
    credentialCryptoContext
  );

  const parsedCredential = parseCredentialSdJwt(
    issuerConf.openid_credential_issuer.credential_configurations_supported,
    decoded,
    ignoreMissingAttributes
  );

  return { parsedCredential };
};

/**
 * Verify and parse an encoded credential.
 * @param issuerConf The Issuer configuration returned by {@link evaluateIssuerTrust}
 * @param credential The encoded credential returned by {@link obtainCredential}
 * @param format The format of the credentual returned by {@link obtainCredential}
 * @param context.credentialCryptoContext The crypto context used to obtain the credential in {@link obtainCredential}
 * @returns A parsed credential with attributes in plain value
 * @throws {IoWalletError} If the credential signature is not verified with the Issuer key set
 * @throws {IoWalletError} If the credential is not bound to the provided user key
 * @throws {IoWalletError} If the credential data fail to parse
 */
export const verifyAndParseCredential: VerifyAndParseCredential = async (
  issuerConf,
  credential,
  format,
  context
) => {
  if (format === "vc+sd-jwt") {
    return verifyAndParseCredentialSdJwt(
      issuerConf,
      credential,
      format,
      context
    );
  }

  throw new IoWalletError(`Unsupported credential format: ${format}`);
};
