"use client";

import { useState } from "react";
import { Accordion, AccordionDetails, AccordionSummary, Box, Typography } from "@/utils/muiImports";
import { ExpandMoreIcon } from "@/utils/muiImports";

export function FAQContent() {
  const [expanded, setExpanded] = useState<string | false>(false);

  const handleChange = (panel: string) => (event: React.SyntheticEvent, isExpanded: boolean) => {
    setExpanded(isExpanded ? panel : false);
  };

  return (
    <Box>
      <Accordion expanded={expanded === "panel1"} onChange={handleChange("panel1")} sx={{ mb: 2 }}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="h6">Как создать курс на платформе</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Box>
            <video
              controls
              width="100%"
              style={{ maxWidth: "800px", borderRadius: "8px" }}
              src="https://storage.yandexcloud.net/gafus-media/uploads/how_to_create_a_course.mp4"
            >
              Ваш браузер не поддерживает видео.
            </video>
          </Box>
        </AccordionDetails>
      </Accordion>
    </Box>
  );
}
