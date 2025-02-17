import type { DcqlQuery } from "dcql";
import { evaluateDcqlQuery } from "../07-evaluate-dcql-query";

const credentials = [
  "eyJraWQiOiItRl82VWdhOG4zVmVnalkyVTdZVUhLMXpMb2FELU5QVGM2M1JNSVNuTGF3IiwidHlwIjoidmMrc2Qtand0IiwiYWxnIjoiRVMyNTYifQ.eyJfc2QiOlsiMHExRDVKbWF2NnBRYUVoX0pfRmN2X3VOTk1RSWdDeWhRT3hxbFk0bDNxVSIsIktDSi1BVk52ODhkLXhqNnNVSUFPSnhGbmJVaDNySFhES2tJSDFsRnFiUnMiLCJNOWxvOVl4RE5JWHJBcTJxV2VpQ0E0MHpwSl96WWZGZFJfNEFFQUxjUnRVIiwiY3pnalVrMG5xUkNzd1NoQ2hDamRTNkExLXY0N2RfcVRDU0ZJdklIaE1vSSIsIm5HblFyN2NsbTN0ZlRwOHlqTF91SHJEU090elIyUFZiOFM3R2VMZEFxQlEiLCJ4TklWd2xwU3NhWjhDSlNmMGd6NXhfNzVWUldXYzZWMW1scGVqZENycVVzIl0sInN1YiI6IjIxNmY4OTQ2LTllY2ItNDgxOS05MzA5LWMwNzZmMzRhN2UxMSIsIl9zZF9hbGciOiJzaGEtMjU2IiwidmN0IjoiUGVyc29uSWRlbnRpZmljYXRpb25EYXRhIiwiaXNzIjoiaHR0cHM6Ly9wcmUuZWlkLndhbGxldC5pcHpzLml0IiwiY25mIjp7Imp3ayI6eyJrdHkiOiJFQyIsImNydiI6IlAtMjU2Iiwia2lkIjoiUnYzVy1FaUtwdkJUeWs1eVp4dnJldi03TURCNlNselVDQm9fQ1FqamRkVSIsIngiOiIwV294N1F0eVBxQnlnMzVNSF9YeUNjbmQ1TGUtSm0wQVhIbFVnREJBMDNZIiwieSI6ImVFaFZ2ZzFKUHFOZDNEVFNhNG1HREdCbHdZNk5QLUVaYkxiTkZYU1h3SWcifX0sImV4cCI6MTc1MTU0NjU3Niwic3RhdHVzIjp7InN0YXR1c19hdHRlc3RhdGlvbiI6eyJjcmVkZW50aWFsX2hhc2hfYWxnIjoic2hhLTI1NiJ9fX0.qXHA2oqr8trX4fGxpxpUft2GX380TM3pzfo1MYAsDjUC8HsODA-4rdRWAvDe2zYP57x4tJU7eiABkd1Kmln9yQ~WyJrSkRFUDhFYU5URU1CRE9aelp6VDR3IiwidW5pcXVlX2lkIiwiVElOSVQtTFZMREFBODVUNTBHNzAyQiJd~WyJ6SUF5VUZ2UGZJcEUxekJxeEk1aGFRIiwiYmlydGhfZGF0ZSIsIjE5ODUtMTItMTAiXQ~WyJHcjNSM3MyOTBPa1FVbS1ORlR1OTZBIiwidGF4X2lkX2NvZGUiLCJUSU5JVC1MVkxEQUE4NVQ1MEc3MDJCIl0~WyJHeE9SYWxNQWVsZlowZWRGSmpqWVV3IiwiZ2l2ZW5fbmFtZSIsIkFkYSJd~WyJfdlY1UklrbDBJT0VYS290czlrdDF3IiwiZmFtaWx5X25hbWUiLCJMb3ZlbGFjZSJd~WyJDajV0Y2NSNzJKd3J6ZTJUVzRhLXdnIiwiaWF0IiwxNzIwMDEwNTc1XQ",
];

describe("evaluateDcqlQuery", () => {
  it("should throw error when the DCQL query structure is invalid", () => {
    const query: DcqlQuery.Input = {
      credentials: [
        {
          id: "PersonIdentificationData",
          format: "vc+sd-jwt",
          // @ts-expect-error invalid query on purpose
          claims: [{ id: "tax_id_code", path: "tax_id_code" }],
        },
      ],
    };

    expect(() => evaluateDcqlQuery(credentials, query)).toThrowError();
  });

  it("should throw error when the DCQL is invalid", () => {
    const query: DcqlQuery.Input = {
      credentials: [
        {
          id: "PersonIdentificationData",
          format: "vc+sd-jwt",
          claims: [{ id: "tax_id_code", path: ["tax_id_code"] }],
          claim_sets: [["missing_claim", "tax_id_code"]],
        },
      ],
    };

    expect(() => evaluateDcqlQuery(credentials, query)).toThrowError();
  });

  it("should work correctly", () => {
    const query: DcqlQuery.Input = {
      credentials: [
        {
          id: "PersonIdentificationData",
          format: "vc+sd-jwt",
          claims: [
            { id: "tax_id_code", path: ["tax_id_code"] },
            { id: "family_name", path: ["family_name"] },
            { id: "given_name", path: ["given_name"] },
          ],
        },
      ],
    };
    const result = evaluateDcqlQuery(credentials, query);

    expect(result?.canBeSatisfied).toEqual(true);
    expect(result?.credential_matches.PersonIdentificationData).toBeDefined();
  });
});
