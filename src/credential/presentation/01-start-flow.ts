import * as z from "zod";
import { ValidationFailed } from "../../utils/errors";

const PresentationParams = z.object({
  clientId: z.string().nonempty(),
  requestUri: z.string().url(),
  requestUriMethod: z.enum(["get", "post"]),
  state: z.string().optional(),
});
export type PresentationParams = z.infer<typeof PresentationParams>;

/**
 * The beginning of the presentation flow.
 * To be implemented accordind to the user touchpoint
 *
 * @param params Presentation parameters, depending on the starting touchoint
 * @returns The url for the Relying Party to connect with
 */
export type StartFlow = (params: PresentationParams) => {
  requestUri: string;
  clientId: string;
  requestUriMethod?: "get" | "post";
  state?: string;
};

/**
 * Start a presentation flow by decoding an incoming QR-code
 *
 * @param params The encoded QR-code content
 * @returns The url for the Relying Party to connect with
 * @throws If the provided qr code fails to be decoded
 */
export const startFlowFromQR: StartFlow = (params) => {
  const result = PresentationParams.safeParse(params);

  if (result.success) {
    return result.data;
  } else {
    throw new ValidationFailed({
      message: "Invalid parameters provided",
      reason: result.error.message,
    });
  }
};
