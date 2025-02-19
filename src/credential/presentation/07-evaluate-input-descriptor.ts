import { InputDescriptor, type RemotePresentation } from "./types";
import { decode, prepareVpToken } from "../../sd-jwt";
import { SdJwt4VC, type DisclosureWithEncoded } from "../../sd-jwt/types";
import { createCryptoContextFor } from "../../utils/crypto";
import { JSONPath } from "jsonpath-plus";
import { MissingDataError, CredentialNotFoundError } from "./errors";
import Ajv from "ajv";
import { byteStringToBase64Url } from "../../utils/string";
const ajv = new Ajv({ allErrors: true });
const INDEX_CLAIM_NAME = 1;

type EvaluatedDisclosures = {
  requiredDisclosures: DisclosureWithEncoded[];
  optionalDisclosures: DisclosureWithEncoded[];
  unrequestedDisclosures: DisclosureWithEncoded[];
};

type EvaluateInputDescriptorSdJwt4VC = (
  inputDescriptor: InputDescriptor,
  payloadCredential: SdJwt4VC["payload"],
  disclosures: DisclosureWithEncoded[]
) => EvaluatedDisclosures;

export type EvaluateInputDescriptors = (
  descriptors: InputDescriptor[],
  credentialsSdJwt: [string /* keyTag */, string /* credential */][],
  credentialsMdoc: [string /* keyTag */, string /* credential */][]
) => {
  evaluatedDisclosure: EvaluatedDisclosures;
  inputDescriptor: InputDescriptor;
  credential: string;
  keyTag: string;
}[];

export type PrepareRemotePresentations = (
  credentialAndDescriptors: {
    requestedClaims: string[];
    inputDescriptor: InputDescriptor;
    credential: string;
    keyTag: string;
  }[],
  nonce: string,
  client_id: string
) => Promise<RemotePresentation[]>;

/**
 * Transforms an array of DisclosureWithEncoded objects into a key-value map.
 * @param disclosures - An array of DisclosureWithEncoded, each containing a decoded property with [?, claimName, claimValue].
 * @returns An object mapping claim names to their corresponding values.
 */
const mapDisclosuresToObject = (
  disclosures: DisclosureWithEncoded[]
): Record<string, unknown> => {
  return disclosures.reduce((obj, { decoded }) => {
    const [, claimName, claimValue] = decoded;
    obj[claimName] = claimValue;
    return obj;
  }, {} as Record<string, unknown>);
};

/**
 * Finds a claim within the payload based on provided JSONPath expressions.
 * @param paths - An array of JSONPath expressions to search for in the payload.
 * @param payload - The object to search within using JSONPath.
 * @returns A tuple with the first matched JSONPath and its corresponding value, or [undefined, undefined] if not found.
 */
const findMatchedClaim = (
  paths: string[],
  payload: any
): [string?, string?] => {
  let matchedPath;
  let matchedValue;
  paths.some((singlePath) => {
    try {
      const result = JSONPath({ path: singlePath, json: payload });
      if (result.length > 0) {
        matchedPath = singlePath;
        matchedValue = result[0];
        return true;
      }
    } catch (error) {
      throw new MissingDataError(
        `JSONPath for "${singlePath}" does not match the provided payload.`
      );
    }
    return false;
  });

  return [matchedPath, matchedValue];
};

/**
 * Extracts the claim name from a path that can be in one of the following formats:
 * 1. $.propertyName
 * 2. $["propertyName"] or $['propertyName']
 *
 * @param path - The path string containing the claim reference.
 * @returns The extracted claim name if matched; otherwise, throws an exception.
 */
const extractClaimName = (path: string): string | undefined => {
  // Define a regular expression that matches both formats:
  // 1. $.propertyName
  // 2. $["propertyName"] or $['propertyName']
  const regex = /^\$\.(\w+)$|^\$\[(?:'|")(\w+)(?:'|")\]$/;

  const match = path.match(regex);
  if (match) {
    // match[1] corresponds to the first capture group (\w+) after $.
    // match[2] corresponds to the second capture group (\w+) inside [""] or ['']
    return match[1] || match[2];
  }

  // If the input doesn't match any of the expected formats, return null

  throw new Error(
    `Invalid input format: "${path}". Expected formats are "$.propertyName", "$['propertyName']", or '$["propertyName"]'.`
  );
};

/**
 * Evaluates an InputDescriptor for an SD-JWT-based verifiable credential.
 *
 * - Checks each field in the InputDescriptor against the provided `payloadCredential`
 *   and `disclosures` (selectively disclosed claims).
 * - Validates whether required fields are present (unless marked optional)
 *   and match any specified JSONPath.
 * - If a field includes a JSON Schema filter, validates the claim value against that schema.
 * - Enforces `limit_disclosure` rules by returning only disclosures, required and optional, matching the specified fields
 *   if set to "required". Otherwise also return the array unrequestedDisclosures with disclosures which can be passed for a particular use case.
 * - Throws an error if a required field is invalid or missing.
 *
 * @param inputDescriptor - Describes constraints (fields, filters, etc.) that must be satisfied.
 * @param payloadCredential - The credential payload to check against.
 * @param disclosures - An array of DisclosureWithEncoded objects representing selective disclosures.
 * @returns A filtered list of disclosures satisfying the descriptor constraints, or throws an error if not.
 * @throws Will throw an error if any required constraint fails or if JSONPath lookups are invalid.
 */
export const evaluateInputDescriptorForSdJwt4VC: EvaluateInputDescriptorSdJwt4VC =
  (inputDescriptor, payloadCredential, disclosures) => {
    if (!inputDescriptor?.constraints?.fields) {
      // No validation, all field are optional
      return {
        requiredDisclosures: [],
        optionalDisclosures: [],
        unrequestedDisclosures: disclosures,
      };
    }
    const requiredClaimNames: string[] = [];
    const optionalClaimNames: string[] = [];

    // Transform disclosures to find claim using JSONPath
    const disclosuresAsPayload = mapDisclosuresToObject(disclosures);

    // For each field, we need at least one matching path
    // If we succeed, we push the matched disclosure in matchedDisclosures and stop checking further paths
    const allFieldsValid = inputDescriptor.constraints.fields.every((field) => {
      // For Potential profile, selectively disclosed claims will always be built as an individual object property, by using a name-value pair.
      // Hence that selective claim for array element and recursive disclosures are not supported by Potential for the first iteration of Piloting.
      // We need to check inside disclosures or inside credential payload. Example path: "$.given_name"
      let [matchedPath, matchedValue] = findMatchedClaim(
        field.path,
        disclosuresAsPayload
      );

      if (!matchedPath) {
        [matchedPath, matchedValue] = findMatchedClaim(
          field.path,
          payloadCredential
        );

        if (!matchedPath) {
          // Path could be optional, in this case no need to validate! continue to next field
          return field?.optional;
        }
      } else {
        // if match a disclouse we save which is required or optional
        const claimName = extractClaimName(matchedPath);
        if (claimName) {
          (field?.optional ? optionalClaimNames : requiredClaimNames).push(
            claimName
          );
        }
      }

      // FILTER validation
      // If this field has a "filter" (JSON Schema), validate the claimValue
      if (field.filter) {
        try {
          const validateSchema = ajv.compile(field.filter);
          if (!validateSchema(matchedValue)) {
            throw new MissingDataError(
              `Claim value "${matchedValue}" for path "${matchedPath}" does not match the provided JSON Schema.`
            );
          }
        } catch (error) {
          return false;
        }
      }
      // Submission Requirements validation
      // TODO: [EUDIW-216] Read rule value if “all” o “pick” and validate

      return true;
    });

    if (!allFieldsValid) {
      throw new MissingDataError(
        "Credential validation failed: Required fields are missing or do not match the input descriptor."
      );
    }

    // Categorizes disclosures into required and optional based on claim names and disclosure constraints.

    const requiredDisclosures = disclosures.filter((disclosure) =>
      requiredClaimNames.includes(disclosure.decoded[INDEX_CLAIM_NAME])
    );

    const optionalDisclosures = disclosures.filter((disclosure) =>
      optionalClaimNames.includes(disclosure.decoded[INDEX_CLAIM_NAME])
    );

    const isNotLimitDisclosure = !(
      inputDescriptor.constraints.limit_disclosure === "required"
    );

    const unrequestedDisclosures = isNotLimitDisclosure
      ? disclosures.filter(
          (disclosure) =>
            !optionalClaimNames.includes(
              disclosure.decoded[INDEX_CLAIM_NAME]
            ) &&
            !requiredClaimNames.includes(disclosure.decoded[INDEX_CLAIM_NAME])
        )
      : [];

    return {
      requiredDisclosures,
      optionalDisclosures,
      unrequestedDisclosures,
    };
  };

type DecodedCredentialSdJwt = {
  keyTag: string;
  credential: string;
  sdJwt: SdJwt4VC;
  disclosures: DisclosureWithEncoded[];
};

/**
 * Finds the first credential that satisfies the input descriptor constraints.
 * @param inputDescriptor The input descriptor to evaluate.
 * @param decodedSdJwtCredentials An array of decoded SD-JWT credentials.
 * @returns An object containing the matched evaluation, keyTag, and credential.
 */
export const findCredentialSdJwt = (
  inputDescriptor: InputDescriptor,
  decodedSdJwtCredentials: DecodedCredentialSdJwt[]
): {
  matchedEvaluation: EvaluatedDisclosures;
  matchedKeyTag: string;
  matchedCredential: string;
} => {
  for (const {
    keyTag,
    credential,
    sdJwt,
    disclosures,
  } of decodedSdJwtCredentials) {
    try {
      const evaluatedDisclosure = evaluateInputDescriptorForSdJwt4VC(
        inputDescriptor,
        sdJwt.payload,
        disclosures
      );

      return {
        matchedEvaluation: evaluatedDisclosure,
        matchedKeyTag: keyTag,
        matchedCredential: credential,
      };
    } catch {
      // skip to next credential
      continue;
    }
  }

  throw new CredentialNotFoundError(
    "None of the vc+sd-jwt credentials satisfy the requirements."
  );
};

/**
 * Evaluates multiple input descriptors against provided SD-JWT and MDOC credentials.
 *
 * For each input descriptor, this function:
 * - Checks the credential format.
 * - Decodes the credential.
 * - Evaluates the descriptor using the associated disclosures.
 *
 * @param inputDescriptors - An array of input descriptors.
 * @param credentialsSdJwt - An array of tuples containing keyTag and SD-JWT credential.
 * @param credentialsMdoc - An array of tuples containing keyTag and MDOC credential.
 * @returns An array of objects, each containing the evaluated disclosures,
 *          the input descriptor, the credential, and the keyTag.
 * @throws {CredentialNotFoundError} When the credential format is unsupported.
 */
export const evaluateInputDescriptors: EvaluateInputDescriptors = (
  inputDescriptors,
  credentialsSdJwt,
  credentialsMdoc
) => {
  // We need decode SD-JWT credentials for evaluation
  const decodedSdJwtCredentials =
    credentialsSdJwt?.map(([keyTag, credential]) => {
      const { sdJwt, disclosures } = decode(credential);
      return { keyTag, credential, sdJwt, disclosures };
    }) || [];

  return inputDescriptors.map((descriptor) => {
    if (descriptor.format?.mso_mdoc) {
      if (!credentialsMdoc || !credentialsMdoc[0]) {
        throw new CredentialNotFoundError(
          "mso_mdoc credential is not supported."
        );
      }
      /**
       * The current implementation for the "mso_mdoc" format is temporary and always returns the first credential (mDL).
       * [WLEO-266] This will be replaced with the real implementation once the evaluateInputDescriptorForMdoc function is available.
       **/
      const [keyTag, credential] = credentialsMdoc[0];
      return {
        evaluatedDisclosure: {
          requiredDisclosures: [],
          optionalDisclosures: [],
          unrequestedDisclosures: [],
        },
        inputDescriptor: descriptor,
        credential,
        keyTag,
      };
    }

    if (descriptor.format?.["vc+sd-jwt"]) {
      if (!decodedSdJwtCredentials.length) {
        throw new CredentialNotFoundError(
          "vc+sd-jwt credential is not supported."
        );
      }

      const { matchedEvaluation, matchedKeyTag, matchedCredential } =
        findCredentialSdJwt(descriptor, decodedSdJwtCredentials);

      return {
        evaluatedDisclosure: matchedEvaluation,
        inputDescriptor: descriptor,
        credential: matchedCredential,
        keyTag: matchedKeyTag,
      };
    }

    throw new CredentialNotFoundError(
      `${descriptor.format} format is not supported.`
    );
  });
};

/**
 * Prepares remote presentations for a set of credentials based on input descriptors.
 *
 * For each credential and its corresponding input descriptor, this function:
 * - Validates the credential format.
 * - Generates a verifiable presentation token (vpToken) using the provided nonce and client identifier.
 *
 * @param credentialAndDescriptors - An array containing objects with requested claims,
 *                                   input descriptor, credential, and keyTag.
 * @param nonce - A unique nonce for the verifiable presentation token.
 * @param client_id - The client identifier.
 * @returns A promise that resolves to an array of RemotePresentation objects.
 * @throws {CredentialNotFoundError} When the credential format is unsupported.
 */
export const prepareRemotePresentations: PrepareRemotePresentations = async (
  credentialAndDescriptors,
  nonce,
  client_id
) => {
  return Promise.all(
    credentialAndDescriptors.map(async (item) => {
      const descriptor = item.inputDescriptor;

      if (descriptor.format?.mso_mdoc) {
        return {
          requestedClaims: item.requestedClaims,
          inputDescriptor: descriptor,
          vpToken: byteStringToBase64Url(item.credential),
          format: "mso_mdoc",
        };
      }

      if (descriptor.format?.["vc+sd-jwt"]) {
        const { vp_token } = await prepareVpToken(nonce, client_id, [
          item.credential,
          item.requestedClaims,
          createCryptoContextFor(item.keyTag),
        ]);

        return {
          requestedClaims: item.requestedClaims,
          inputDescriptor: descriptor,
          vpToken: vp_token,
          format: "vc+sd-jwt",
        };
      }

      throw new CredentialNotFoundError(
        `${descriptor.format} format is not supported.`
      );
    })
  );
};
