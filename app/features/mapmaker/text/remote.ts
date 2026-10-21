/**
 * The Text Tool's server side, seen from the editor: the person's own text
 * styles (saved to their account, within the plan's limit) and the official
 * styles the atelier publishes (above the plan: listed but locked).
 * Signed-out visitors keep the built-in styles.
 */
import { useCallback, useEffect, useState } from "react";
import { textStyles } from "../../account/api";
import { ApiError } from "@/lib/api/client";
import type { TextStyleRecord, User } from "../../account/types";
import type { TextLook } from "../types";
import { FACTORY_TEXT_LOOK, type TextStyle } from "./state";
import { validLook } from "./validate";

/** A look as the server returns it: "" comes back as null and {} as []. */
function serverLook(look: TextLook): TextLook {
  return {
    ...look,
    lang: look.lang ?? "",
    features: Array.isArray(look.features) ? {} : look.features,
  };
}

function toStyle(r: TextStyleRecord): TextStyle | null {
  if (r.look && !validLook(r.look)) return null;
  return {
    id: `s:${r.id}`,
    source: r.official ? "official" : "own",
    name: r.name,
    look: r.look
      ? { ...FACTORY_TEXT_LOOK, ...serverLook(r.look) }
      : FACTORY_TEXT_LOOK,
    locked: r.locked || !r.look,
  };
}

export function useTextLibrary(
  user: User | null | undefined,
  describeError: (e: unknown) => string,
) {
  const [own, setOwn] = useState<TextStyle[]>([]),
    [official, setOfficial] = useState<TextStyle[]>([]),
    [max, setMax] = useState<number | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [limitPrompt, setLimitPrompt] = useState<{
      max: number | null;
      plan: string | null;
    } | null>(null);

  const apply = useCallback(
    (r: Awaited<ReturnType<typeof textStyles.list>>) => {
      const styles = r.data.map(toStyle).filter((s): s is TextStyle => !!s);
      setOwn(styles.filter((s) => s.source === "own"));
      setOfficial(styles.filter((s) => s.source === "official"));
      setMax(r.limits.max);
    },
    [],
  );
  const refresh = useCallback(
    () => textStyles.list().then(apply, () => {}),
    [apply],
  );

  useEffect(() => {
    if (!user) return;
    let live = true;
    textStyles.list().then(
      (r) => {
        if (live) apply(r);
      },
      () => {},
    );
    return () => {
      live = false;
    };
  }, [user, apply]);

  const save = useCallback(
    async (name: string, look: TextLook) => {
      setBusy(true);
      setError(null);
      try {
        await textStyles.create({ name, look });
        await refresh();
      } catch (e) {
        if (
          e instanceof ApiError &&
          e.code === "plan_limit_reached" &&
          e.body.limit === "text_styles"
        ) {
          setLimitPrompt({
            max: typeof e.body.max === "number" ? e.body.max : null,
            plan: typeof e.body.plan === "string" ? e.body.plan : null,
          });
          void refresh();
        } else setError(describeError(e));
      } finally {
        setBusy(false);
      }
    },
    [refresh, describeError],
  );
  const remove = useCallback(
    async (styleId: string) => {
      setOwn((list) => list.filter((s) => s.id !== styleId));
      try {
        await textStyles.remove(styleId.replace(/^s:/, ""));
      } catch (e) {
        setError(describeError(e));
        await refresh();
      }
    },
    [refresh, describeError],
  );
  const promptLimit = useCallback(
    () => setLimitPrompt({ max, plan: null }),
    [max],
  );
  const closeLimitPrompt = useCallback(() => setLimitPrompt(null), []);

  return {
    own: user ? own : [],
    official: user ? official : [],
    max: user ? max : null,
    busy,
    error,
    save,
    remove,
    limitPrompt: user ? limitPrompt : null,
    promptLimit,
    closeLimitPrompt,
  };
}
