import { Link, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { useLabels } from "../../api/queries/labels";
import type { Label } from "../../api/types";
import { Icon, type IconName } from "../../components/Icon";
import { formatCount } from "../../lib/format";
import { t } from "../../lib/i18n";
import { SYSTEM_VIEWS, type SystemView } from "../../lib/labels";
import { usePrefs, useUi } from "../../state/ui";
import { useAccountIndex, useActiveAccount } from "../account";

type ItemProps = {
  slug: string;
  name: string;
  icon: IconName;
  count: number;
  bold: boolean;
  collapsed: boolean;
  color?: string | null;
  title?: string;
};

function NavItem({ slug, name, icon, count, bold, collapsed, color, title }: ItemProps) {
  const account = useAccountIndex();
  const params = useParams({ strict: false }) as { label?: string };
  const active = params.label === slug;
  return (
    <li>
      <Link
        to="/u/$account/$label"
        params={{ account, label: slug }}
        aria-current={active ? "page" : undefined}
        aria-label={collapsed ? name : undefined}
        title={title ?? (collapsed ? name : undefined)}
        className={`flex h-8 items-center gap-4 rounded-r-full pr-3 pl-6 ${
          active ? "bg-nav-active font-semibold" : "hover:bg-hover"
        } ${bold ? "font-semibold" : ""}`}
      >
        <span style={color ? { color } : undefined} className="shrink-0">
          <Icon name={icon} size={20} />
        </span>
        {!collapsed && (
          <>
            <span className="flex-1 truncate">{name}</span>
            {count > 0 && <span className="text-xs">{formatCount(count)}</span>}
          </>
        )}
      </Link>
    </li>
  );
}

function systemCount(view: SystemView, labels: Label[]): number {
  if (!view.count || !view.labelId) return 0;
  const l = labels.find((x) => x.id === view.labelId);
  if (!l) return 0;
  return view.count === "unread" ? l.threadsUnread : l.threadsTotal;
}

/** LeftNav (plan 6.3): compose, system labels with counters, user labels, server folders. */
export function LeftNav() {
  const collapsed = usePrefs((s) => s.navCollapsed);
  const openCompose = useUi((s) => s.setComposeOpen);
  const account = useActiveAccount();
  const labels = useLabels(account?.id);
  const [more, setMore] = useState(false);

  const visible = (l: Label) =>
    l.showInList === "show" || (l.showInList === "show_if_unread" && l.threadsUnread > 0);
  const userLabels = labels.filter((l) => l.type === "user" && visible(l));
  const folders = labels.filter((l) => l.type === "folder" && visible(l));
  const views = SYSTEM_VIEWS.filter((v) => !v.more || more);

  return (
    <nav
      aria-label={t.mainMenu}
      className={`flex shrink-0 flex-col overflow-y-auto pb-4 ${collapsed ? "w-[72px]" : "w-64"}`}
    >
      <div className="px-2 py-2">
        <button
          type="button"
          onClick={() => openCompose(true)}
          aria-label={collapsed ? t.compose : undefined}
          className="flex h-14 items-center gap-3 rounded-2xl bg-compose px-4 font-medium shadow-sm hover:shadow"
        >
          <Icon name="edit" size={24} />
          {!collapsed && <span className="pr-2">{t.compose}</span>}
        </button>
      </div>
      <ul className="mt-2">
        {views.map((v) => {
          const count = systemCount(v, labels);
          return (
            <NavItem
              key={v.slug}
              slug={v.slug}
              name={v.name}
              icon={v.icon}
              count={count}
              bold={v.count === "unread" && count > 0}
              collapsed={collapsed}
            />
          );
        })}
        <li>
          <button
            type="button"
            onClick={() => setMore((m) => !m)}
            aria-expanded={more}
            className="flex h-8 w-full items-center gap-4 rounded-r-full pr-3 pl-6 text-left hover:bg-hover"
          >
            <Icon name="expandMore" className={more ? "rotate-180" : ""} />
            {!collapsed && <span>{more ? t.less : t.more}</span>}
          </button>
        </li>
      </ul>
      {userLabels.length > 0 && (
        <LabelSection title={t.labels} labels={userLabels} icon="label" collapsed={collapsed} />
      )}
      {folders.length > 0 && (
        <LabelSection title={t.folders} labels={folders} icon="folder" collapsed={collapsed} />
      )}
    </nav>
  );
}

function LabelSection(props: {
  title: string;
  labels: Label[];
  icon: IconName;
  collapsed: boolean;
}) {
  return (
    <section aria-label={props.title} className="mt-4">
      {!props.collapsed && <h2 className="px-6 py-1 text-base">{props.title}</h2>}
      <ul>
        {props.labels.map((l) => (
          <NavItem
            key={l.id}
            slug={l.id}
            name={l.name}
            icon={props.icon}
            count={l.threadsUnread}
            bold={l.threadsUnread > 0}
            collapsed={props.collapsed}
            color={l.colorBg}
            title={l.keywordState === "local_only" ? `${l.name} – ${t.localOnlyLabel}` : undefined}
          />
        ))}
      </ul>
    </section>
  );
}
