/**
 * Strings for the pages and notices outside the normal flow: not found,
 * errors, loading, maintenance, offline (English and Arabic).
 */
export const systemEn = {
  sysNotFoundCode: "404",
  sysNotFoundTitle: "This place isn't on our map",
  sysNotFoundLead:
    "The page you were looking for doesn't exist, or it has moved. Every map has its unexplored edges — this is one of ours.",
  sysNotFoundAddress: "Address",
  sysGoHome: "Back to the start",
  sysMyMaps: "My maps",
  sysCreateMap: "Draw a map",
  sysPrintStudio: "Print studio",

  sysErrorTitle: "Something went off course",
  sysErrorLead:
    "This page ran into an unexpected problem. It has been reported, and trying again often fixes it.",
  sysEditorErrorTitle: "The editor stopped unexpectedly",
  sysEditorErrorLead:
    "Your map is saved on this device as you work, so nothing should be lost. Try again, or reload the editor to pick up where you were.",
  sysTryAgain: "Try again",
  sysReload: "Reload the page",
  sysReference: "Reference",
  sysReferenceHint:
    "If this keeps happening, send us this reference so we can find what went wrong.",
  sysDetails: "Technical details",
  sysCopy: "Copy",
  sysCopied: "Copied",

  sysLoading: "Charting the way…",

  sysMaintenanceTitle: "Down for maintenance",
  sysMaintenanceLead:
    "We're improving the atelier. Accounts and cloud maps will be back shortly; this page comes back by itself when they are.",
  sysMaintenanceUntil: "Expected back in about {{minutes}} min.",
  sysMaintenanceOffline:
    "Meanwhile, the map editor and the print studio still work, and keep your work on this device.",
  sysOpenEditor: "Open the editor",
  sysCheckNow: "Check now",
  sysChecking: "Checking…",

  sysBannerOffline:
    "You're offline. Your work is kept on this device and syncs when you're back.",
  sysBannerMaintenance:
    "Maintenance under way: cloud saving is paused, your work is kept on this device.",
  sysBannerUnreachable:
    "Can't reach the atelier's server right now. Retrying — your work is kept on this device.",
  sysBannerBack: "Connected again.",

  sysErrorMaintenance:
    "The atelier is down for maintenance. Please try again in a few minutes.",
  sysErrorServer: "Something went wrong on our side. Please try again.",
  sysErrorServerRef:
    "Something went wrong on our side. Please try again (reference {{reference}}).",
};

export const systemAr: typeof systemEn = {
  sysNotFoundCode: "404",
  sysNotFoundTitle: "هذا المكان ليس على ^خَريطتنا^",
  sysNotFoundLead:
    "الصفحة التي تبحث عنها غير موجودة، أو نُقلت إلى مكان آخر. لكل خريطة أطراف مجهولة، وهذه واحدة من أطرافنا.",
  sysNotFoundAddress: "العنوان",
  sysGoHome: "العودة إلى البداية",
  sysMyMaps: "خرائطي",
  sysCreateMap: "ارسم خريطة",
  sysPrintStudio: "استوديو الطباعة",

  sysErrorTitle: "^حَدث^ خطأ غير متوقع",
  sysErrorLead:
    "واجهت هذه الصفحة مشكلة غير متوقعة. أُبلغنا بها، وكثيراً ما تحلّها إعادة المحاولة.",
  sysEditorErrorTitle: "^تَوقّف^ المحرّر بشكل غير متوقع",
  sysEditorErrorLead:
    "خريطتك تُحفظ على هذا الجهاز أثناء العمل، فلا ينبغي أن يضيع شيء. أعد المحاولة، أو أعد تحميل المحرّر لتكمل من حيث توقفت.",
  sysTryAgain: "أعد المحاولة",
  sysReload: "أعد تحميل الصفحة",
  sysReference: "الرقم المرجعي",
  sysReferenceHint: "إن تكررت المشكلة، أرسل لنا هذا الرقم لنجد سببها.",
  sysDetails: "تفاصيل تقنية",
  sysCopy: "نسخ",
  sysCopied: "نُسخ",

  sysLoading: "نرسم الطريق…",

  sysMaintenanceTitle: "^المَوقع^ في صيانة",
  sysMaintenanceLead:
    "نعمل على تحسين المرسم. ستعود الحسابات والخرائط السحابية قريباً، وتعود هذه الصفحة وحدها حين تعود.",
  sysMaintenanceUntil: "متوقّع أن نعود خلال {{minutes}} دقيقة تقريباً.",
  sysMaintenanceOffline:
    "في الأثناء، محرّر الخرائط واستوديو الطباعة يعملان، ويحفظان عملك على هذا الجهاز.",
  sysOpenEditor: "افتح المحرّر",
  sysCheckNow: "تحقّق الآن",
  sysChecking: "جارٍ التحقق…",

  sysBannerOffline:
    "أنت غير متصل بالإنترنت. عملك محفوظ على هذا الجهاز ويُزامَن عند عودتك.",
  sysBannerMaintenance:
    "صيانة جارية: الحفظ السحابي متوقف مؤقتاً، وعملك محفوظ على هذا الجهاز.",
  sysBannerUnreachable:
    "تعذّر الوصول إلى خادم المرسم الآن. نعيد المحاولة، وعملك محفوظ على هذا الجهاز.",
  sysBannerBack: "عاد الاتصال.",

  sysErrorMaintenance: "المرسم في صيانة الآن. حاول مجدداً بعد دقائق.",
  sysErrorServer: "حدث خطأ من جهتنا. حاول مجدداً.",
  sysErrorServerRef:
    "حدث خطأ من جهتنا. حاول مجدداً (الرقم المرجعي {{reference}}).",
};
