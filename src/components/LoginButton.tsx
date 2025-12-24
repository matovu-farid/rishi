import { LogIn, LogOut } from "lucide-react";
import { Button } from "./ui/Button";
import { openUrl } from "@tauri-apps/plugin-opener";
import { getState, getUserFromStore, signout } from "@/generated";
import { getCurrent, onOpenUrl } from "@tauri-apps/plugin-deep-link";
import { useAtom, useAtomValue } from "jotai";
import { isLoggedInAtom, userAtom } from "./pdf/atoms/user";
import { getUser } from "@/generated";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/components/ui/avatar";
import { useEffect, useState } from "react";

export function LoginButton() {
  const [user, setUser] = useAtom(userAtom);
  const isLoggedIn = useAtomValue(isLoggedInAtom);
  const [isLoading, setIsLoading] = useState(true);
  useEffect(() => {
    void (async () => {
      try {
        const user = await getUserFromStore();
        setUser(user);
      } catch (error) {
        setUser(null);
        console.error(error);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);
  async function login() {
    const state = await getState();
    const startUrls = await getCurrent();

    await openUrl(
      `https://rishi-web.matovu-farid.com?login=true&state=${state}`
    );
    async function handleDeepLink(urls: string[]) {
      if (urls.length === 0) return;
      const url = new URL(urls[0]);
      if (url.origin !== "rishi://auth/callback") return;
      const receivedState = url.searchParams.get("state");
      if (state !== receivedState) return;
      const userId = url.searchParams.get("userId");
      if (!userId) return;
      const user = await getUser({ userId });
      if (!user) return;
      setUser(user);
    }
    if (startUrls) {
      await handleDeepLink(startUrls);
    }

    // we are going to pause till we get the callback from the login
    // rishi://auth/callback?state=1234567890

    await onOpenUrl(handleDeepLink);
  }
  async function logout() {
    setUser(null);
    await signout();
  }

  if (isLoading) {
    return <></>;
  }
  if (user && isLoggedIn) {
    return (
      <div className="flex gap-2">
        <Avatar>
          <AvatarImage src={user.imageUrl ?? ""} />
          <AvatarFallback>{user.firstName?.[0]}</AvatarFallback>
        </Avatar>
        <Button
          variant="ghost"
          className="cursor-pointer"
          startIcon={<LogOut size={20} />}
          onClick={logout}
        >
          Logout
        </Button>
      </div>
    );
  }
  return (
    <Button
      variant="ghost"
      className="cursor-pointer"
      startIcon={<LogIn size={20} />}
      onClick={login}
    >
      Login
    </Button>
  );
}
