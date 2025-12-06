import { createClient } from "@liveblocks/client";
import { createRoomContext } from "@liveblocks/react";

const client = createClient({
  publicApiKey: import.meta.env.VITE_LIVEBLOCKS_PUBLIC_KEY || "pk_prod_PLACEHOLDER_KEY_YOU_NEED_TO_REPLACE_THIS",
});

export const {
  RoomProvider,
  useOthers,
  useSelf,
} = createRoomContext(client);
