import { IconButton, IOThemeLight } from "@pagopa/io-app-design-system";
import {
  DefaultTheme,
  NavigationContainer,
  type Theme,
} from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import React, { useCallback } from "react";
import { useSelector } from "react-redux";
import { CredentialScreen } from "../screens/CredentialScreen";
import HomeScreen from "../screens/HomeScreen";
import IdpLoginScreen from "../screens/login/IdpLoginScreen";
import PidSpidIdpSelectionScreen from "../screens/login/PidSpidIdpSelectionScreen";
import PidSpidLoginScreen from "../screens/login/PidLoginScreen";
import { PidScreen } from "../screens/PidScreen";
import SettingsScreen from "../screens/SettingsScreen";
import { StatusAttestationScreen } from "../screens/StatusAttestationScreen";
import {
  TrustmarkQrCodeScreen,
  TrustmarkScreen,
} from "../screens/TrustmarkScreen";
import { WalletInstanceScreen } from "../screens/WalletInstanceScreen";
import { setDebugVisibility } from "../store/reducers/debug";
import { selectIoAuthToken } from "../store/reducers/sesssion";
import type { SupportedCredentialsWithoutPid } from "../store/types";
import { useAppDispatch } from "../store/utils";
import { labelByCredentialType } from "../utils/ui";
import IdpSelectionScreen from "../screens/login/IdpSelectionScreen";
import { PresentationScreen } from "../screens/PresentationScreen";
import { QrScannerScreen } from "../screens/QrScannerScreen";

/**
 * MainStackNav parameters list for each defined screen.
 */
export type MainStackNavParamList = {
  Home: undefined;
  WalletInstance: undefined;
  Pid: undefined;
  Credentials: undefined;
  StatusAttestation: undefined;
  Trustmark: undefined;
  TrustmarkQrCode: { credentialType: SupportedCredentialsWithoutPid };
  Login: undefined;
  IdpSelection: undefined;
  IdpLogin: { idp: string };
  PidSpidIdpSelection: undefined;
  Settings: undefined;
  PidSpidLogin: {
    authUrl: string;
    redirectUri: string;
  };
  Presentations: undefined;
  QrScanner: undefined;
};

const Stack = createNativeStackNavigator<MainStackNavParamList>();

const lightTheme: Theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: IOThemeLight["appBackground-primary"],
    card: IOThemeLight["appBackground-primary"],
  },
};

export const MainStackNavigator = () => {
  const ioAuthToken = useSelector(selectIoAuthToken);
  const dispatch = useAppDispatch();

  const headerRight = useCallback(
    () => (
      <IconButton
        icon="ladybug"
        onPress={() => dispatch(setDebugVisibility(true))}
        accessibilityLabel={"debug"}
      />
    ),
    [dispatch]
  );

  return (
    <NavigationContainer theme={lightTheme}>
      <Stack.Navigator id="MainStackNavigator">
        {ioAuthToken ? (
          /*
           * Protected routes via the ioAuthToken
           */
          <Stack.Group
            screenOptions={{
              headerRight: headerRight,
            }}
          >
            <Stack.Screen
              name="Home"
              component={HomeScreen}
              options={{ title: "ITW Test" }}
            />
            <Stack.Screen
              name="WalletInstance"
              component={WalletInstanceScreen}
              options={{ title: "Test Wallet Instance" }}
            />
            <Stack.Screen
              name="Pid"
              component={PidScreen}
              options={{ title: "Test PID issuance" }}
            />
            <Stack.Screen
              name="PidSpidIdpSelection"
              component={PidSpidIdpSelectionScreen}
              options={{ title: "Test PID issuance" }}
            />
            <Stack.Screen
              name="PidSpidLogin"
              component={PidSpidLoginScreen}
              options={{ title: "PID SPID Login" }}
            />
            <Stack.Screen
              name="Credentials"
              component={CredentialScreen}
              options={{ title: "Test credentials issuance" }}
            />
            <Stack.Screen
              name="StatusAttestation"
              component={StatusAttestationScreen}
              options={{ title: "Test credentials attestations" }}
            />
            <Stack.Screen
              name="Trustmark"
              component={TrustmarkScreen}
              options={{ title: "Test credentials trustmark" }}
            />
            <Stack.Screen
              name="TrustmarkQrCode"
              component={TrustmarkQrCodeScreen}
              options={({ route }) => ({
                title: `${
                  labelByCredentialType[route.params.credentialType]
                } trustmark`,
              })}
            />
            <Stack.Screen
              name="Presentations"
              component={PresentationScreen}
              options={{ title: "Presentation" }}
            />
            <Stack.Screen
              name="QrScanner"
              component={QrScannerScreen}
              options={{ title: "Scan QR" }}
            />
            <Stack.Screen
              name="Settings"
              component={SettingsScreen}
              options={{ title: "Settings" }}
            />
          </Stack.Group>
        ) : (
          <Stack.Group>
            <Stack.Screen
              name="IdpSelection"
              component={IdpSelectionScreen}
              options={{ title: "IO Login" }}
            />
            <Stack.Screen
              name="IdpLogin"
              component={IdpLoginScreen}
              options={{ title: "IO Login" }}
            />
          </Stack.Group>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};
