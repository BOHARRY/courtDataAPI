// Boooook/controllers/contactController.js
import * as contactService from '../services/contactService.js';

export async function submitContactFormController(req, res, next) {
  try {
    const formData = {
      name: req.body.name,
      email: req.body.email,
      topic: req.body.topic,
      message: req.body.message,
      organization: req.body.organization || '', // 可選欄位
      userId: req.body.userId || null, // 從 FormData 獲取，如果前端有傳
    };
    const file = req.file; // multer 會將單個檔案放在 req.file

    // 基本的後端驗證 (可以更詳細)
    if (!formData.name || !formData.email || !formData.topic || !formData.message) {
      return res.status(400).json({ error: 'Bad Request', message: '缺少必要的表單欄位。' });
    }

    const result = await contactService.handleSubmitContactForm(formData, file);

    res.status(201).json({
      message: '您的訊息已成功送出！',
      submissionId: result.id,
      attachmentUrl: result.attachmentUrl,
    });
  } catch (error) {
    next(error); // 交給全局錯誤處理中間件
  }
}