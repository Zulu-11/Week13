import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Platform, StyleSheet, Text, View, Button, Alert } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import * as Location from 'expo-location';

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc } from 'firebase/firestore';

// — Firebase setup —————————————————————————————————————
const firebaseConfig = {
  apiKey: 'YOUR_API_KEY',
  authDomain: 'YOUR_APP.firebaseapp.com',
  projectId: 'YOUR_PROJECT_ID',
};
initializeApp(firebaseConfig);
const db = getFirestore();

// — Notification handler —————————————————————————————————
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// — Register for push notifications ————————————————————————
async function registerForPushNotificationsAsync(): Promise<string> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
    });
  }
  if (!Device.isDevice) throw new Error('Physical device required');
  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') {
    throw new Error('Push permission not granted');
  }
  const projectId =
    Constants?.expoConfig?.extra?.eas?.projectId ??
    Constants?.easConfig?.projectId;
  if (!projectId) throw new Error('EAS projectId missing');
  const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
  return tokenData.data;
}

// — Schedule a local notification —————————————————————————
async function scheduleLocalNotification(title: string, body: string) {
  await Notifications.scheduleNotificationAsync({
    content: { title, body },
    trigger: null, // fire immediately
  });
}

// — Main App —————————————————————————————————————————————
export default function App() {
  const [expoPushToken, setExpoPushToken] = useState<string>('');
  const [fsSuccess, setFsSuccess]     = useState(0);
  const [fsFail,    setFsFail]        = useState(0);
  const [fcmSuccess, setFcmSuccess]   = useState(0);
  const [fcmFail,    setFcmFail]      = useState(0);

  const notificationListener = useRef<Notifications.Subscription>();
  const responseListener     = useRef<Notifications.Subscription>();

  // 1) Get push token & attach listeners
  useEffect(() => {
    registerForPushNotificationsAsync()
      .then(setExpoPushToken)
      .catch(err => Alert.alert('Push Error', err.message));

    notificationListener.current = Notifications.addNotificationReceivedListener(() => {});
    responseListener.current     = Notifications.addNotificationResponseReceivedListener(() => {});

    return () => {
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
  }, []);

  // 2) When button pressed → location → Firestore + FCM → summary notification
  const addData = useCallback(async () => {
    // local copies so we can increment before sending summary
    let fsSucc = fsSuccess, fsF = fsFail;
    let fcmSucc = fcmSuccess, fcmF = fcmFail;

    // — Location permission & fetch —
    let latitude = 0, longitude = 0;
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') throw new Error('Location permission denied');
      const { coords } = await Location.getCurrentPositionAsync({});
      ({ latitude, longitude } = coords);
    } catch (locErr: any) {
      console.warn('Location error:', locErr.message);
      // continue even if location failed
    }

    // — Firestore write —
    try {
      await addDoc(collection(db, 'users'), {
        first:     'Raditya',
        last:      'HerKristito',
        born:       2002,
        createdAt: new Date(),
        lat:        latitude,
        lon:        longitude,
      });
      fsSucc++;
      setFsSuccess(fsSucc);
    } catch (err: any) {
      fsF++;
      setFsFail(fsF);
    }

    // — FCM (Expo push) —
    try {
      const resp = await fetch('https://exp.host/--/api/v2/push/send', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to:    expoPushToken,
          title: 'Test FCM',
          body:  'Check your summary notification',
        }),
      });
      if (!resp.ok) throw new Error(`Status ${resp.status}`);
      fcmSucc++;
      setFcmSuccess(fcmSucc);
    } catch (err: any) {
      console.warn('FCM error:', err.message);
      fcmF++;
      setFcmFail(fcmF);
    }

    // — Final summary notification —
    const summary = 
      `Firestore: ${fsSucc} successful, ${fsF} failed\n` +
      `FCM:       ${fcmSucc} successful, ${fcmF} failed`;
    await scheduleLocalNotification('Summary', summary);
  }, [expoPushToken, fsSuccess, fsFail, fcmSuccess, fcmFail]);

  return (
    <View style={styles.container}>
      <Text>Your Expo push token:</Text>
      <Text selectable style={styles.token}>{expoPushToken}</Text>
      <View style={styles.buttons}>
        <Button title="Add User & Notify" onPress={addData} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  token: {
    marginVertical: 10,
  },
  buttons: {
    marginTop: 20,
  },
});
