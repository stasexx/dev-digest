"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { s } from "./styles";

/** Shown when the deep-link target file is not part of this PR's diff. */
export function NotInDiffNotice() {
  const t = useTranslations("brief");
  return (
    <p role="status" aria-live="polite" style={s.hint}>
      {t("nav.notInDiff")}
    </p>
  );
}
