import TestScenario from "./component/TestScenario";
import createWalletInstance from "./create-wallet-instance";
import getAttestation from "./get-attestation";
import prepareIntegrityContext from "./prepare-integrity-context";
import getPid from "./get-pid";
import getCredential from "./get-crendential";

const scenarios = {
  prepareIntegrityContext,
  createWalletInstance,
  getAttestation,
  getPid,
  getCredential,
};

export default scenarios;
export type { ScenarioRunner } from "./types";
export { TestScenario };
