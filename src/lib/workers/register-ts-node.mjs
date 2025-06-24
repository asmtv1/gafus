// Подключаем хуки ts-node как ESM-загрузчик
import { register } from "node:module";
import { pathToFileURL } from "node:url";

// второй аргумент – URL каталога, в котором будет искаться loader-модуль
register("ts-node/esm", pathToFileURL("./"));
