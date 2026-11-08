import React from "react";
import { BrandMark } from "@/app/dashboard/Icon";
import { DASHBOARD_FONT_CLASS } from "@/app/dashboard/fonts";
import "./auth.css";

const SITE_URL = "https://kerdaxis.com";

/** Night header band and centered card area shared by the access pages. */
export function AuthShell({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <div className={`ka ${DASHBOARD_FONT_CLASS}`}>
      <header className="ka-head">
        <div className="ka-head-row">
          <a className="ka-brand" href={SITE_URL} aria-label="Kerdaxis">
            <BrandMark />
            <span>Kerdaxis</span>
          </a>
          <a className="ka-back" href={SITE_URL}>← kerdaxis.com</a>
        </div>
      </header>
      <main className="ka-main">{children}</main>
    </div>
  );
}
