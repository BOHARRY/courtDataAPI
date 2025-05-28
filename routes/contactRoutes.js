// Boooook/routes/contactRoutes.js
import express from 'express';
import multer from 'multer';
import { submitContactFormController } from '../controllers/contactController.js';

const router = express.Router();

// 配置 multer
// 使用 memoryStorage 將檔案暫存於記憶體中，適合小檔案，然後由 service 上傳到 Firebase Storage
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 限制檔案大小為 5MB (與前端一致)
  },
  fileFilter: (req, file, cb) => {
    // 檢查檔案類型 (可以更嚴格)
    if (file.mimetype === 'application/pdf' || file.mimetype === 'image/jpeg' || file.mimetype === 'image/png') {
      cb(null, true);
    } else {
      cb(new Error('不支援的檔案類型！僅允許 PDF, JPG, PNG。'), false);
    }
  },
});

// POST /api/contact/submit (或簡化為 /api/contact)
// 使用 upload.single('attachment') 來處理名為 'attachment' 的單個檔案上傳
router.post(
  '/submit',
  upload.single('attachment'), // 'attachment' 必須與前端 FormData 中檔案欄位的名稱一致
  submitContactFormController
);

// Multer 錯誤處理中間件 (可選，但推薦，放在路由之後)
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    // Multer 錯誤 (例如檔案過大)
    return res.status(400).json({ error: 'File Upload Error', message: err.message });
  } else if (err) {
    // 其他錯誤 (例如 fileFilter 返回的錯誤)
    if (err.message.includes('不支援的檔案類型')) {
        return res.status(400).json({ error: 'Invalid File Type', message: err.message });
    }
    return res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
  next();
});


export default router;