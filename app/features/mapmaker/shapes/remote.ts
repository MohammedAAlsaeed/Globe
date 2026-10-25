/**
 * The Shape Tool's server side, seen from the editor: the person's own shape
 * styles (saved to their account, within the plan's limit) and the official
 * styles the atelier publishes (above the plan: listed but locked).
 * Signed-out visitors keep the built-in styles.
 */
import { useCallback, useEffect, useState } from "react";
import { shapeStyles } from "../../account/api";
import { ApiError } from "@/lib/api/client";
import type { ShapeStyleRecord, User } from "../../account/types";
import type { ShapeLook } from "../types";
import { factoryShapeLook, type ShapeStyle } from "./state";
import { validShapeLook } from "./validate";

function toStyle(r: ShapeStyleRecord): ShapeStyle | null {
  if (r.look && !validShapeLook(r.look)) return null;
  return {
    id: `s:${r.id}`,
    source: r.official ? "official" : "own",
    name: r.name,
    look: r.look ?? factoryShapeLook(),
    locked: r.locked || !r.look,
  };
}

export function useShapeLibrary(
  user: User | null | undefined,
  describeError: (e: unknown) => string,
) {
  const [own, setOwn] = useState<ShapeStyle[]>([]),
    [official, setOfficial] = useState<ShapeStyle[]>([]),
    [max, setMax] = useState<number | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [limitPrompt, setLimitPrompt] = useState<{
      max: number | null;
      plan: string | null;
    } | null>(null);

  const apply = useCallback(
    (r: Awaited<ReturnType<typeof shapeStyles.list>>) => {
      const styles = r.data.map(toStyle).filter((s): s is ShapeStyle => !!s);
      setOwn(styles.filter((s) => s.source === "own"));
      setOfficial(styles.filter((s) => s.source === "official"));
      setMax(r.limits.max);
    },
    [],
  );
  const refresh = useCallback(
    () => shapeStyles.list().then(apply, () => {}),
    [apply],
  );

  useEffect(() => {
    if (!user) return;
    let live = true;
    shapeStyles.list().then(
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
    async (name: string, look: ShapeLook) => {
      setBusy(true);
      setError(null);
      try {
        await shapeStyles.create({ name, look });
        await refresh();
      } catch (e) {
        if (
          e instanceof ApiError &&
          e.code === "plan_limit_reached" &&
          e.body.limit === "shape_styles"
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
        await shapeStyles.remove(styleId.replace(/^s:/, ""));
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
