export type TemplateFamily = "acm" | "ieee" | "acl" | "usenix" | "neurips" | "iclr" | "cvf" | "springer" | "custom";

export type ReviewMode = "anonymous" | "non_anonymous" | "camera_ready";

export type VenueTemplateProfile = {
  profile_id: string;
  venue_key: string;
  venue_name: string;
  aliases?: string[];
  domain?: string;
  ccf_rank?: "A" | "B" | "C";
  template_family: TemplateFamily;
  publisher_hint?: string;
  official_template_url?: string | null;
  official_template_version?: string;
  official_template_verified_at?: string | null;
  review_modes: ReviewMode[];
  default_review_mode: ReviewMode;
  latex: {
    documentclass?: string;
    documentclass_options?: string[];
    usepackages?: string[];
    bibliography_style?: string;
    citation_style?: "numeric" | "author_year" | "venue_specific";
    main_tex_template: string;
    section_template_dir: string;
    compile_engine: "pdflatex" | "xelatex" | "lualatex" | "tectonic";
  };
  paper_rules: {
    columns?: 1 | 2;
    font_size?: string;
    main_page_limit?: number | null;
    references_count_toward_limit?: boolean | null;
    appendix_allowed?: boolean | null;
    supplement_allowed?: boolean | null;
    checklist_required?: boolean;
    anonymity_required?: boolean;
  };
  required_files: string[];
  optional_files: string[];
  forbidden_patterns?: string[];
  notes: string[];
};

export type TemplateResolveInput = {
  venue?: string;
  domain?: string;
  family?: string;
  year?: number;
  mode?: "review" | "camera_ready";
  paperType?: string;
};

export type TemplateResolveResult = {
  profile: VenueTemplateProfile;
  confidence: "high" | "medium" | "low";
  needsOfficialVerification: boolean;
  verificationTasks: string[];
};
