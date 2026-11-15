import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { auth, googleSignIn, logout } from '../services/auth';
import { fetchCurrentUserProfile, UserProfileResponse } from '../services/postgresService';

export interface AuthContextValue {
  firebaseUser: User | null;
  userProfile: UserProfileResponse;
  isLoading: boolean;
  isAdmin: boolean;
  isVip: boolean;
  vipTier: 'free' | 'collector' | 'archivist';
  signInWithGoogle: () => Promise<void>;
  signOutUser: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const DEFAULT_PROFILE: UserProfileResponse = {
  uid: 'admin-primary',
  email: 'admin@comicvault.local',
  displayName: 'Creator Admin',
  avatarUrl: null,
  role: 'admin',
  vipTier: 'archivist',
  isBannedFromProposals: false,
  storageBytesUsed: 0,
  dailyUsage: {
    usageDate: new Date().toISOString().slice(0, 10),
    readsCount: 0,
    writesCount: 0,
  },
};

const AuthContext = createContext<AuthContextValue>({
  firebaseUser: null,
  userProfile: DEFAULT_PROFILE,
  isLoading: false,
  isAdmin: true,
  isVip: true,
  vipTier: 'archivist',
  signInWithGoogle: async () => {},
  signOutUser: async () => {},
  refreshProfile: async () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfileResponse>(DEFAULT_PROFILE);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const refreshProfile = useCallback(async () => {
    try {
      const profile = await fetchCurrentUserProfile();
      if (profile && profile.uid) {
        setUserProfile(profile);
      }
    } catch {
      // Keep existing or default fallback profile in offline mode
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      await refreshProfile();
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [refreshProfile]);

  const signInWithGoogle = useCallback(async () => {
    await googleSignIn();
    await refreshProfile();
  }, [refreshProfile]);

  const signOutUser = useCallback(async () => {
    await logout();
    await refreshProfile();
  }, [refreshProfile]);

  const isAdmin = userProfile.role === 'admin';
  const isVip =
    isAdmin || userProfile.vipTier === 'collector' || userProfile.vipTier === 'archivist';

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        userProfile,
        isLoading,
        isAdmin,
        isVip,
        vipTier: userProfile.vipTier,
        signInWithGoogle,
        signOutUser,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
