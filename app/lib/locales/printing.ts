/** Strings for saving maps as images and for the print studio (English and Arabic). */
export const printingEn = {
  // ---- Save as image (editor) ----
  exSaveTitle: "Save as image",
  exFormat: "Format",
  exFormat_png: "Best quality",
  exFormat_jpeg: "Smallest file",
  exFormat_webp: "For the web",
  exFormat_tiff: "For print shops",
  exFormat_pdf: "Ready to print",
  exSize: "Size",
  exScale_0_25: "Quarter",
  exScale_0_5: "Half",
  exScale_1: "Full size",
  exScale_2: "Double",
  exPrintsAt: "{{w}} × {{h}} cm at 300 DPI",
  exQuality: "Quality",
  exNote_png:
    "Lossless, with the print resolution (300 DPI) stored in the file. The best choice in most cases.",
  exNote_jpeg:
    "Much smaller files for sharing. Lower quality shows as blur around fine lines.",
  exNote_webp:
    "Small files with high quality, for websites and messages. Some older apps can't open it.",
  exNote_tiff:
    "Uncompressed, the format many print shops ask for. Files are large.",
  exNote_pdf:
    "One page at the map's printed size (300 DPI), to send straight to a printer. Texts are vector outlines — sharp at any size, the same in every viewer — and can still be selected and searched.",
  exFormat_svg: "Vector texts",
  exNote_svg:
    "For Illustrator, Inkscape and the web: the map as pictures, with every text as a vector on top of (or under) them in its place.",
  exTextMode: "Texts",
  exText_outlines: "Outlines",
  exText_outlinesHint: "Look exactly the same everywhere, without the fonts.",
  exText_editable: "Editable text",
  exText_editableHint:
    "Straight texts stay real text you can edit and search. Curved texts stay outlines.",
  exEmbedFonts: "Fonts inside the file",
  exEmbedFontsOn:
    "Only the letters used, so the file stays small and looks the same everywhere.",
  exEmbedFontsOff:
    "A smaller file, but the fonts must be installed wherever it's opened.",
  exSaveAs: "Save {{format}}",
  exSaving: "Rendering…",
  exSaved: "Saved — {{w}} × {{h}} px.",
  exFailed: "The image couldn't be made at this size. Try a smaller size.",
  exLimitTitle: "Larger exports need a bigger plan",
  exLimitText:
    "Your {{plan}} plan exports up to {{px}} px on the long side. Upgrade to save and print larger maps.",
  exLimitGuest:
    "Without an account, maps export up to {{px}} px on the long side. Sign in and choose a plan to save and print larger maps.",
  // ---- print studio (/print) ----
  prHeroGlobe: "Your map, as a globe.",
  prHeroPoster: "Your map, on the wall.",
  prIntroGlobe:
    "Cut and glue gores into a sphere. Set its size, check every sheet, and print at exactly 100%.",
  prIntroPoster:
    "One sheet or a large poster across several. Add a frame and a title, and print ready to cut and assemble.",
  prModes: "What to print",
  prModeGlobe: "Globe",
  prModeGlobeNote: "Gores to cut and assemble",
  prModePoster: "Poster",
  prModePosterNote: "Flat, one or many sheets",
  prSourceTitle: "The map",
  prSample: "Atelier world map",
  prFromEditor: "From the editor",
  prFromDevice: "From your device",
  prSampleBadge: "Sample",
  prBackToEditor: "Back to the editor",
  prOtherImage: "Use another image",
  prOnGlobe: "The map on the globe",
  prFitIntro:
    "This map is {{ratio}}:1; a globe needs 2:1. Choose how it covers the sphere.",
  prFitContain: "Keep its proportions",
  prFitContainLat:
    "Nothing is distorted. It covers {{north}}°N to {{south}}°S; the poles are the sea colour.",
  prFitContainLon:
    "Nothing is distorted. It spans pole to pole and {{degrees}}° of the 360° around; the rest is the sea colour.",
  prFitStretch: "Stretch to cover",
  prFitStretchNote: "Covers the whole sphere, but shapes are stretched.",
  prFillColor: "Sea colour",
  prFillReset: "The map's own",
  prFitPreview: "The image the globe is made from",
  prSizeTitle: "Size & paper",
  prSizePage: "Fit one sheet",
  prSizePageNote: "As large as the paper allows",
  prSizeCustom: "Choose a size",
  prSizeCustomNote: "Across several sheets if needed",
  prPosterWidth: "Poster width",
  prPosterHeight: "Poster height",
  prOverlap: "Sheet overlap",
  prTiledNote:
    "Printed on {{count}} sheets ({{cols}} across × {{rows}} down). The red dashed strip on each sheet is where the next one is glued.",
  prCutTitle: "Cutting",
  prBleed: "Bleed",
  prCropMarks: "Crop marks",
  prCutNote:
    "Bleed extends the picture past the edge so trimming leaves no white line; print shops usually ask for 3 mm. Crop marks show where to cut.",
  prFrameTitle: "Frame & title",
  prFrame: "Frame",
  prFrame_none: "None",
  prFrame_line: "Line",
  prFrame_double: "Double",
  prFrame_ornate: "Engraved",
  prTitle: "Title",
  prTitlePlaceholder: "The Kingdom of Andalor",
  prSubtitle: "Subtitle",
  prSubtitlePlaceholder: "Drawn by … · 2026",
  prInk: "Frame & text",
  prMat: "Border",
  prOverview: "Whole poster",
  prPreview: "Preview",
  prPageLimit:
    "This size needs more than 250 sheets. Choose a smaller size or a larger paper.",
  prPosterSize: "Poster size",
  prPrintTitle: "Printing",
  prPrintNote:
    "Measured pages, at the size shown. Your image stays on this device.",
  prQualityLow:
    "About {{ppi}} PPI at this size: it will look soft. Export the map larger from the editor, or print smaller.",
  prQualityOk:
    "About {{ppi}} PPI at this size: good for viewing from a little distance.",
  prQualityHigh: "About {{ppi}} PPI at this size: sharp, even up close.",
  prDownloadImage: "Download poster image",
  prPrintOpened:
    "The poster opened in a new tab. Print it at 100% (actual size).",
  prPrintPreparing: "Preparing your poster for printing…",
  prPrintDownloaded:
    "Your browser didn't allow a new tab, so the poster was downloaded as a PDF. Open it and print at 100% (actual size).",
  prAssembleNote:
    'Print every sheet at 100% with "fit to page" off. Trim each sheet along the red dashed line of its neighbour, then glue them in order: A1, A2… row by row.',
  prActualSize: 'Print at 100% (actual size) with "fit to page" off.',
};

export const printingAr: typeof printingEn = {
  exSaveTitle: "حفظ كصورة",
  exFormat: "الصيغة",
  exFormat_png: "أعلى جودة",
  exFormat_jpeg: "أصغر حجم",
  exFormat_webp: "للويب",
  exFormat_tiff: "للمطابع",
  exFormat_pdf: "جاهز للطباعة",
  exSize: "المقاس",
  exScale_0_25: "الربع",
  exScale_0_5: "النصف",
  exScale_1: "المقاس الكامل",
  exScale_2: "الضعف",
  exPrintsAt: "{{w}} × {{h}} سم بدقة 300 نقطة/بوصة",
  exQuality: "الجودة",
  exNote_png:
    "بلا أي فقد في الجودة، ودقة الطباعة (300 نقطة/بوصة) محفوظة في الملف. الخيار الأفضل غالبًا.",
  exNote_jpeg:
    "ملفات أصغر بكثير للمشاركة. الجودة الأقل تظهر كتشويش حول الخطوط الدقيقة.",
  exNote_webp:
    "ملفات صغيرة بجودة عالية، للمواقع والرسائل. بعض البرامج القديمة لا تفتحها.",
  exNote_tiff:
    "بلا ضغط، وهي الصيغة التي تطلبها كثير من المطابع. الملفات كبيرة.",
  exNote_pdf:
    "صفحة واحدة بمقاس الخريطة المطبوع (300 نقطة/بوصة)، لإرسالها مباشرة إلى الطابعة. النصوص فيها متجهية — حادة بأي مقاس ومتطابقة في كل برنامج — ويمكن تحديدها والبحث فيها.",
  exFormat_svg: "نصوص متجهية",
  exNote_svg:
    "لـ Illustrator وInkscape والويب: الخريطة كصور، وكل نص فيها متجهي فوقها (أو تحتها) في موضعه.",
  exTextMode: "النصوص",
  exText_outlines: "مسارات",
  exText_outlinesHint: "تبدو متطابقة في كل مكان، دون الحاجة إلى الخطوط.",
  exText_editable: "نص قابل للتحرير",
  exText_editableHint:
    "النصوص المستقيمة تبقى نصًا حقيقيًا يمكن تحريره والبحث فيه. النصوص المنحنية تبقى مسارات.",
  exEmbedFonts: "الخطوط داخل الملف",
  exEmbedFontsOn:
    "الحروف المستخدمة فقط، فيبقى الملف صغيرًا ويظهر متطابقًا في كل مكان.",
  exEmbedFontsOff: "ملف أصغر، لكن يلزم تثبيت الخطوط حيثما يُفتح.",
  exSaveAs: "حفظ {{format}}",
  exSaving: "جارٍ التجهيز…",
  exSaved: "تم الحفظ — {{w}} × {{h}} بكسل.",
  exFailed: "تعذّر إنشاء الصورة بهذا المقاس. جرّب مقاسًا أصغر.",
  exLimitTitle: "التصدير الأكبر يحتاج خطة أعلى",
  exLimitText:
    "خطة {{plan}} تصدّر حتى {{px}} بكسل للضلع الأطول. رقِّ خطتك لحفظ وطباعة خرائط أكبر.",
  exLimitGuest:
    "بدون حساب، تُصدَّر الخرائط حتى {{px}} بكسل للضلع الأطول. سجّل الدخول واختر خطة لحفظ وطباعة خرائط أكبر.",
  // ---- print studio (/print) ----
  prHeroGlobe: "خريطتك، ككرة أرضية.",
  prHeroPoster: "خريطتك، على الجدار.",
  prIntroGlobe:
    "قصّ الشرائح وألصقها لتصبح كرة. حدّد مقاسها، وراجع كل ورقة، واطبع بمقاس 100% تمامًا.",
  prIntroPoster:
    "ورقة واحدة أو بوستر كبير على عدة أوراق. أضف إطارًا وعنوانًا، واطبعها جاهزة للقص والتجميع.",
  prModes: "ماذا تطبع",
  prModeGlobe: "كرة أرضية",
  prModeGlobeNote: "شرائح للقص والتجميع",
  prModePoster: "بوستر",
  prModePosterNote: "مسطّحة، ورقة أو أكثر",
  prSourceTitle: "الخريطة",
  prSample: "خريطة العالم من المرسم",
  prFromEditor: "من المحرر",
  prFromDevice: "من جهازك",
  prSampleBadge: "نموذج",
  prBackToEditor: "العودة إلى المحرر",
  prOtherImage: "استخدام صورة أخرى",
  prOnGlobe: "الخريطة على الكرة",
  prFitIntro:
    "نسبة هذه الخريطة {{ratio}}:1، والكرة تحتاج 2:1. اختر كيف تغطي الكرة.",
  prFitContain: "الحفاظ على النسبة",
  prFitContainLat:
    "بلا أي تشويه. تغطي من {{north}}° شمالًا إلى {{south}}° جنوبًا، والقطبان بلون البحر.",
  prFitContainLon:
    "بلا أي تشويه. تمتد من القطب إلى القطب و{{degrees}}° من 360° حول الكرة، والباقي بلون البحر.",
  prFitStretch: "مدّها لتغطي الكرة",
  prFitStretchNote: "تغطي الكرة كلها، لكن الأشكال تتمدد.",
  prFillColor: "لون البحر",
  prFillReset: "لون الخريطة نفسها",
  prFitPreview: "الصورة التي تُصنع منها الكرة",
  prSizeTitle: "المقاس والورق",
  prSizePage: "ملء ورقة واحدة",
  prSizePageNote: "أكبر ما يسمح به الورق",
  prSizeCustom: "اختيار مقاس",
  prSizeCustomNote: "على عدة أوراق عند الحاجة",
  prPosterWidth: "عرض البوستر",
  prPosterHeight: "ارتفاع البوستر",
  prOverlap: "تداخل الأوراق",
  prTiledNote:
    "تُطبع على {{count}} أوراق ({{cols}} أفقيًا × {{rows}} رأسيًا). الشريط الأحمر المتقطع في كل ورقة هو مكان لصق الورقة التالية.",
  prCutTitle: "القص",
  prBleed: "النزيف (Bleed)",
  prCropMarks: "علامات القص",
  prCutNote:
    "النزيف يمدّ الصورة خلف حافة القص حتى لا يبقى خط أبيض بعد القص؛ تطلب المطابع عادة 3 مم. وعلامات القص تبيّن أين تقص.",
  prFrameTitle: "الإطار والعنوان",
  prFrame: "الإطار",
  prFrame_none: "بلا",
  prFrame_line: "خط",
  prFrame_double: "مزدوج",
  prFrame_ornate: "منقوش",
  prTitle: "العنوان",
  prTitlePlaceholder: "مملكة الأندلور",
  prSubtitle: "العنوان الفرعي",
  prSubtitlePlaceholder: "رسمها … · 2026",
  prInk: "الإطار والنص",
  prMat: "الحاشية",
  prOverview: "البوستر كاملًا",
  prPreview: "المعاينة",
  prPageLimit:
    "هذا المقاس يحتاج أكثر من 250 ورقة. اختر مقاسًا أصغر أو ورقًا أكبر.",
  prPosterSize: "مقاس البوستر",
  prPrintTitle: "الطباعة",
  prPrintNote: "صفحات بمقاسات دقيقة، بالحجم المعروض. صورتك تبقى على جهازك.",
  prQualityLow:
    "نحو {{ppi}} نقطة/بوصة بهذا المقاس: ستبدو غير حادة. صدّر الخريطة بحجم أكبر من المحرر، أو اطبع أصغر.",
  prQualityOk:
    "نحو {{ppi}} نقطة/بوصة بهذا المقاس: جيدة للمشاهدة من مسافة قصيرة.",
  prQualityHigh: "نحو {{ppi}} نقطة/بوصة بهذا المقاس: حادة حتى عن قرب.",
  prDownloadImage: "تنزيل صورة البوستر",
  prPrintOpened: "فُتح البوستر في تبويب جديد. اطبعه بمقاس 100% (الحجم الفعلي).",
  prPrintPreparing: "جارٍ تجهيز البوستر للطباعة…",
  prPrintDownloaded:
    "لم يسمح المتصفح بفتح تبويب جديد، فنُزِّل البوستر كملف PDF. افتحه واطبعه بمقاس 100% (الحجم الفعلي).",
  prAssembleNote:
    "اطبع كل الأوراق بمقاس 100% مع إيقاف «ملاءمة الصفحة». قصّ كل ورقة على الخط الأحمر المتقطع لجارتها، ثم ألصقها بالترتيب: A1 ثم A2… صفًا بعد صف.",
  prActualSize: "اطبع بمقاس 100% (الحجم الفعلي) مع إيقاف «ملاءمة الصفحة».",
};
