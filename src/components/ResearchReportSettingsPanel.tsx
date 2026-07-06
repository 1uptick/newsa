import React, { useCallback, useEffect, useState } from "react";

import { BookmarkPlus, CalendarRange, Gauge, Globe, Plus, Sparkles, Trash2, Users } from "lucide-react";

import { useAuth } from "../contexts/AuthContext";

import {

  createSavedCustomWritingStyle,

  deleteSavedCustomWritingStyle,

  loadSavedCustomWritingStyles,

  updateSavedCustomWritingStyle,

  type SavedCustomWritingStyle,

} from "../lib/atfxResearchCustomStyles";

import {

  CUSTOM_STYLE_INSTRUCTIONS_MAX,

  CUSTOM_STYLE_NAME_MAX,

  PACE_PRESETS,

  REPORT_AUDIENCE_OPTIONS,

  REPORT_HORIZON_OPTIONS,

  REPORT_LANGUAGE_OPTIONS,

  REPORT_STYLE_OPTIONS,

  applyPace,

  draftCustomStyleInstructions,

  draftCustomStyleName,

  normalizeCustomStyleInstructions,

  normalizeCustomStyleName,

  toggleReportLanguage,

  type ReportAudience,

  type ReportHorizon,

  type ReportLanguage,

  type ReportOutputOptions,

  type ReportPace,

  type ReportStyle,

} from "../lib/atfxResearchReportOptions";



type ResearchReportSettingsPanelProps = {

  options: ReportOutputOptions;

  onChange: (next: ReportOutputOptions) => void;

  disabled?: boolean;

};



function chipClass(active: boolean, disabled?: boolean) {

  return [

    "rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-all text-left",

    disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer",

    active

      ? "border-[#ff7900] bg-gradient-to-br from-orange-50 to-orange-100/80 text-[#c45f00] shadow-sm ring-1 ring-[#ff7900]/25"

      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50",

  ].join(" ");

}



function cardClass(active: boolean, disabled?: boolean) {

  return [

    "flex-1 min-w-[5.5rem] rounded-xl border p-2.5 text-left transition-all",

    disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer",

    active

      ? "border-[#ff7900] bg-gradient-to-br from-orange-50 to-white shadow-md ring-2 ring-[#ff7900]/20"

      : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm",

  ].join(" ");

}



function SettingsSection({

  icon: Icon,

  title,

  hint,

  children,

}: {

  icon: React.ComponentType<{ className?: string }>;

  title: string;

  hint?: string;

  children: React.ReactNode;

}) {

  return (

    <section className="rounded-xl border border-slate-200/90 bg-white p-3 shadow-sm">

      <div className="flex items-start gap-2 mb-2.5">

        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-[#ff7900]">

          <Icon className="h-3.5 w-3.5" />

        </div>

        <div className="min-w-0">

          <h3 className="text-xs font-bold text-slate-800 tracking-wide">{title}</h3>

          {hint ? <p className="text-[10px] text-slate-500 leading-snug mt-0.5">{hint}</p> : null}

        </div>

      </div>

      {children}

    </section>

  );

}



export function ResearchReportSettingsPanel({

  options,

  onChange,

  disabled = false,

}: ResearchReportSettingsPanelProps) {

  const { user } = useAuth();

  const userId = user?.uid ?? null;



  const [savedStyles, setSavedStyles] = useState<SavedCustomWritingStyle[]>([]);

  const [draftStyleName, setDraftStyleName] = useState("");

  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const [saveError, setSaveError] = useState<string | null>(null);



  const refreshSavedStyles = useCallback(() => {

    setSavedStyles(loadSavedCustomWritingStyles(userId));

  }, [userId]);



  useEffect(() => {

    refreshSavedStyles();

  }, [refreshSavedStyles]);



  useEffect(() => {

    if (options.style === "custom" && options.savedCustomStyleId) {

      setDraftStyleName(options.customStyleName ?? "");

    } else if (options.style === "custom") {

      setDraftStyleName((prev) => prev || options.customStyleName || "");

    }

  }, [options.style, options.savedCustomStyleId, options.customStyleName]);



  const patch = <K extends keyof ReportOutputOptions>(key: K, value: ReportOutputOptions[K]) => {

    onChange({ ...options, [key]: value });

  };



  const selectBuiltInStyle = (value: ReportStyle) => {

    if (value === "custom") {

      onChange({

        ...options,

        style: "custom",

        savedCustomStyleId: undefined,

        customStyleName: undefined,

      });

      return;

    }

    onChange({

      ...options,

      style: value,

      savedCustomStyleId: undefined,

      customStyleName: undefined,

      customStyleInstructions: undefined,

    });

  };



  const selectSavedStyle = (saved: SavedCustomWritingStyle) => {

    setSaveMessage(null);

    setSaveError(null);

    setDraftStyleName(saved.name);

    onChange({

      ...options,

      style: "custom",

      savedCustomStyleId: saved.id,

      customStyleName: saved.name,

      customStyleInstructions: saved.instructions,

    });

  };



  const startNewCustomStyle = () => {

    setSaveMessage(null);

    setSaveError(null);

    setDraftStyleName("");

    onChange({

      ...options,

      style: "custom",

      savedCustomStyleId: undefined,

      customStyleName: undefined,

      customStyleInstructions: "",

    });

  };



  const handleSaveCustomStyle = () => {

    setSaveMessage(null);

    setSaveError(null);



    const name = normalizeCustomStyleName(draftStyleName);

    const instructions = normalizeCustomStyleInstructions(options.customStyleInstructions);



    if (options.savedCustomStyleId) {

      const { style, error } = updateSavedCustomWritingStyle(

        options.savedCustomStyleId,

        { name, instructions },

        userId

      );

      if (error || !style) {

        setSaveError(error ?? "Could not update style.");

        return;

      }

      refreshSavedStyles();

      onChange({

        ...options,

        style: "custom",

        savedCustomStyleId: style.id,

        customStyleName: style.name,

        customStyleInstructions: style.instructions,

      });

      setDraftStyleName(style.name);

      setSaveMessage(`Updated "${style.name}".`);

      return;

    }



    const { style, error } = createSavedCustomWritingStyle(name, instructions, userId);

    if (error || !style) {

      setSaveError(error ?? "Could not save style.");

      return;

    }

    refreshSavedStyles();

    onChange({

      ...options,

      style: "custom",

      savedCustomStyleId: style.id,

      customStyleName: style.name,

      customStyleInstructions: style.instructions,

    });

    setDraftStyleName(style.name);

    setSaveMessage(`Saved "${style.name}".`);

  };



  const handleDeleteCustomStyle = () => {

    if (!options.savedCustomStyleId) return;

    const name = options.customStyleName ?? "style";

    deleteSavedCustomWritingStyle(options.savedCustomStyleId, userId);

    refreshSavedStyles();

    onChange({

      ...options,

      style: "custom",

      savedCustomStyleId: undefined,

      customStyleName: undefined,

    });

    setSaveMessage(null);

    setSaveError(null);

    setDraftStyleName("");

    setSaveMessage(`Deleted "${name}".`);

  };



  const builtInStyles = REPORT_STYLE_OPTIONS.filter((opt) => opt.value !== "custom");

  const customActive = options.style === "custom";

  const savedStyleActive = customActive && Boolean(options.savedCustomStyleId);



  return (

    <div className="space-y-2.5 px-4 pb-16 pt-3 bg-gradient-to-b from-orange-100 to-orange-50">

      <SettingsSection

        icon={Sparkles}

        title="Writing style"

        hint="Pick a preset, reuse a saved style, or write your own instructions."

      >

        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">

          {builtInStyles.map((opt) => (

            <button

              key={opt.value}

              type="button"

              disabled={disabled}

              onClick={() => selectBuiltInStyle(opt.value as ReportStyle)}

              className={cardClass(options.style === opt.value, disabled)}

              aria-pressed={options.style === opt.value}

            >

              <span className="block text-xs font-bold text-slate-800">{opt.label}</span>

              <span className="block text-[10px] text-slate-500 mt-0.5 leading-tight">{opt.hint}</span>

            </button>

          ))}

        </div>



        <div className="mt-3 space-y-1.5">

          <div className="flex items-center justify-between gap-2">

            <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-wide">Your saved styles</p>

            <button

              type="button"

              disabled={disabled}

              onClick={startNewCustomStyle}

              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-600 hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50"

            >

              <Plus className="h-3 w-3" />

              New custom

            </button>

          </div>



          {savedStyles.length === 0 ? (

            <p className="text-[10px] text-slate-500 leading-snug rounded-lg border border-dashed border-slate-200 bg-slate-50/80 px-2.5 py-2">

              No saved styles yet. Write instructions below and save with a name to reuse later.

            </p>

          ) : (

            <div className="flex flex-wrap gap-1.5">

              {savedStyles.map((saved) => {

                const active = options.savedCustomStyleId === saved.id;

                return (

                  <button

                    key={saved.id}

                    type="button"

                    disabled={disabled}

                    onClick={() => selectSavedStyle(saved)}

                    className={chipClass(active, disabled)}

                    aria-pressed={active}

                    title={saved.instructions.slice(0, 120)}

                  >

                    {saved.name}

                  </button>

                );

              })}

            </div>

          )}

        </div>



        {customActive ? (
          <div className="mt-2.5 space-y-2 rounded-lg border border-orange-100 bg-orange-50/40 p-2.5">
            <div className="space-y-1">
              <label htmlFor="custom-style-name" className="block text-[10px] font-semibold text-slate-600">
                Style name {savedStyleActive ? "(update saved preset)" : "(save for reuse)"}
              </label>
              <input
                id="custom-style-name"
                type="text"
                disabled={disabled}
                maxLength={CUSTOM_STYLE_NAME_MAX}
                value={draftStyleName}
                onChange={(e) => {
                  setSaveMessage(null);
                  setSaveError(null);
                  setDraftStyleName(draftCustomStyleName(e.target.value));
                }}
                placeholder="e.g. Podcast script, Client newsletter, Macro brief"
                className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-700 placeholder:text-slate-400 focus:border-[#ff7900] focus:outline-none focus:ring-2 focus:ring-[#ff7900]/20 disabled:opacity-50"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="custom-style-instructions" className="block text-[10px] font-semibold text-slate-600">
                Style instructions
              </label>
              <textarea
                id="custom-style-instructions"
                disabled={disabled}
                rows={4}
                maxLength={CUSTOM_STYLE_INSTRUCTIONS_MAX}
                value={options.customStyleInstructions ?? ""}
                onChange={(e) => {
                  setSaveMessage(null);
                  patch("customStyleInstructions", draftCustomStyleInstructions(e.target.value));
                }}
                placeholder="Describe tone, structure, section names, formatting rules, or voice. Example: Write like a morning podcast script — short paragraphs, rhetorical hooks, end each section with one actionable takeaway."
                className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-700 placeholder:text-slate-400 focus:border-[#ff7900] focus:outline-none focus:ring-2 focus:ring-[#ff7900]/20 disabled:opacity-50"
              />
              <p className="text-[10px] text-slate-500 leading-snug">
                {(options.customStyleInstructions?.length ?? 0).toLocaleString()} /{" "}
                {CUSTOM_STYLE_INSTRUCTIONS_MAX.toLocaleString()} characters
              </p>
            </div>



            <div className="flex flex-wrap items-center gap-1.5">

              <button

                type="button"

                disabled={disabled}

                onClick={handleSaveCustomStyle}

                className="inline-flex items-center gap-1 rounded-lg bg-[#ff7900] px-2.5 py-1.5 text-[10px] font-bold text-white hover:bg-[#e56d00] disabled:opacity-50"

              >

                <BookmarkPlus className="h-3.5 w-3.5" />

                {savedStyleActive ? "Update saved style" : "Save style"}

              </button>

              {savedStyleActive ? (

                <button

                  type="button"

                  disabled={disabled}

                  onClick={handleDeleteCustomStyle}

                  className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-[10px] font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"

                >

                  <Trash2 className="h-3.5 w-3.5" />

                  Delete

                </button>

              ) : null}

            </div>



            {saveMessage ? <p className="text-[10px] font-medium text-emerald-700">{saveMessage}</p> : null}

            {saveError ? <p className="text-[10px] font-medium text-red-600">{saveError}</p> : null}

          </div>

        ) : null}

      </SettingsSection>



      <SettingsSection

        icon={Users}

        title="Audience"

        hint="Who the report is written for — tone and depth follow this choice."

      >

        <div className="grid grid-cols-2 gap-2">

          {REPORT_AUDIENCE_OPTIONS.map((opt) => (

            <button

              key={opt.value}

              type="button"

              disabled={disabled}

              onClick={() => patch("audience", opt.value as ReportAudience)}

              className={cardClass(options.audience === opt.value, disabled)}

              aria-pressed={options.audience === opt.value}

            >

              <span className="block text-xs font-bold text-slate-800">{opt.label}</span>

              <span className="block text-[10px] text-slate-500 mt-0.5 leading-tight">{opt.hint}</span>

            </button>

          ))}

        </div>

      </SettingsSection>



      <SettingsSection

        icon={Gauge}

        title="Pace"

        hint="Controls length and how much market data is gathered."

      >

        <div className="flex gap-2">

          {(Object.entries(PACE_PRESETS) as Array<[ReportPace, (typeof PACE_PRESETS)[ReportPace]]>).map(

            ([value, preset]) => (

              <button

                key={value}

                type="button"

                disabled={disabled}

                onClick={() => onChange(applyPace(value, options))}

                className={cardClass(options.pace === value, disabled)}

                aria-pressed={options.pace === value}

              >

                <span className="block text-xs font-bold text-slate-800">{preset.label}</span>

                <span className="block text-[10px] text-slate-500 mt-0.5 leading-tight">

                  {preset.detail}

                </span>

              </button>

            )

          )}

        </div>

      </SettingsSection>



      <SettingsSection

        icon={CalendarRange}

        title="Outlook"

        hint="Time horizon for catalysts and calendar research."

      >

        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">

          {REPORT_HORIZON_OPTIONS.map((opt) => (

            <button

              key={opt.value}

              type="button"

              disabled={disabled}

              onClick={() => patch("horizon", opt.value as ReportHorizon)}

              className={`${chipClass(options.horizon === opt.value, disabled)} w-full text-center justify-center`}

              aria-pressed={options.horizon === opt.value}

            >

              {opt.label}

            </button>

          ))}

        </div>

      </SettingsSection>



      <SettingsSection

        icon={Globe}

        title="Languages"

        hint="English is always written first. Add TC, SC, TH, or VI for translation."

      >

        <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">

          {REPORT_LANGUAGE_OPTIONS.map((opt) => {

            const selected = options.languages.includes(opt.value);

            const locked = opt.value === "en";

            return (

              <button

                key={opt.value}

                type="button"

                disabled={disabled || locked}

                onClick={() =>

                  onChange({

                    ...options,

                    languages: toggleReportLanguage(options.languages, opt.value as ReportLanguage),

                  })

                }

                className={`${chipClass(selected, disabled || locked)} w-full text-center justify-center ${

                  locked ? "opacity-70" : ""

                }`}

                aria-pressed={selected}

                title={locked ? "English is always generated first" : opt.hint}

              >

                {opt.label}

                {locked ? (

                  <span className="block text-[9px] font-normal text-slate-400 mt-0.5">Required</span>

                ) : opt.hint ? (

                  <span className="block text-[9px] font-normal text-slate-400 mt-0.5">{opt.hint}</span>

                ) : null}

              </button>

            );

          })}

        </div>

      </SettingsSection>

    </div>

  );

}


