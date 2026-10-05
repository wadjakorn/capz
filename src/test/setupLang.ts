// Unit tests assert English copy; the app's default language is Thai.
import { useI18n } from "@/i18n/store";

useI18n.setState({ lang: "en" });
