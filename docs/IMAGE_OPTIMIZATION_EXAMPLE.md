// Пример дополнительной серверной оптимизации с Sharp
// Добавить в функции загрузки файлов

import sharp from 'sharp';

async function optimizeImageForCDN(file: File): Promise<Buffer> {
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  
  // Дополнительная оптимизация на сервере
  const optimizedBuffer = await sharp(buffer)
    .jpeg({ 
      quality: 85,        // Качество 85%
      progressive: true,  // Прогрессивная загрузка
      mozjpeg: true      // Лучший алгоритм сжатия
    })
    .webp({ 
      quality: 80,        // WebP с качеством 80%
      effort: 6          // Максимальное сжатие
    })
    .toBuffer();
    
  return optimizedBuffer;
}

// Использование в uploadFileToCDN:
async function uploadFileToCDN(file: File, relativePath: string): Promise<string> {
  try {
    const bucketName = "gafus-media";
    const s3Path = `s3://${bucketName}/uploads/${relativePath}`;
    
    // Дополнительная оптимизация на сервере
    const optimizedBuffer = await optimizeImageForCDN(file);
    
    // Создаем временный файл для загрузки
    const tempFilePath = `/tmp/${Date.now()}-${file.name}`;
    await writeFile(tempFilePath, optimizedBuffer);
    
    // Команда для загрузки файла в Object Storage
    const command = `yc storage s3 cp "${tempFilePath}" "${s3Path}"`;
    
    await execAsync(command);
    await execAsync(`rm "${tempFilePath}"`);
    
    return `/uploads/${relativePath}`;
  } catch (error) {
    logger.error(`❌ Ошибка загрузки в CDN: ${error}`);
    throw error;
  }
}
