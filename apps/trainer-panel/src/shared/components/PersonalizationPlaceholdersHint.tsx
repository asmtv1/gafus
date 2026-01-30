"use client";

import { Alert, AlertTitle, Typography } from "@mui/material";

/**
 * Подсказка по плейсхолдерам персонализации для форм шага и дня.
 * Показывается при создании/редактировании шага или дня.
 */
export default function PersonalizationPlaceholdersHint() {
  return (
    <Alert severity="info" sx={{ mt: 2, mb: 2 }}>
      <AlertTitle>Плейсхолдеры для персонализированных курсов</AlertTitle>
      <Typography variant="body2" component="div" sx={{ mt: 1 }}>
        В названии и описании можно использовать плейсхолдеры — они подставятся для каждого
        ученика (имя, пол, имя питомца). Работает только если у курса включена опция
        «Персонализированный курс».
      </Typography>
      <Typography variant="body2" component="div" sx={{ mt: 1.5 }}>
        <strong>Имя ученика:</strong>{" "}
        <code>{"{{userName}}"}</code> — им. (кто?); <code>{"{{userNameGen}}"}</code> — род. (кого?);{" "}
        <code>{"{{userNameDat}}"}</code> — дат. (кому?); <code>{"{{userNameAcc}}"}</code> — вин. (кого?);{" "}
        <code>{"{{userNameIns}}"}</code> — твор. (кем?); <code>{"{{userNamePre}}"}</code> — предл. (о ком?).
      </Typography>
      <Typography variant="body2" component="div" sx={{ mt: 1 }}>
        <strong>Имя питомца:</strong>{" "}
        <code>{"{{petName}}"}</code> — им.; <code>{"{{petNameGen}}"}</code> — род.;{" "}
        <code>{"{{petNameDat}}"}</code> — дат.; <code>{"{{petNameAcc}}"}</code> — вин. (учим {"{{petNameAcc}}"} держать);{" "}
        <code>{"{{petNameIns}}"}</code> — твор.; <code>{"{{petNamePre}}"}</code> — предл.
      </Typography>
    </Alert>
  );
}
