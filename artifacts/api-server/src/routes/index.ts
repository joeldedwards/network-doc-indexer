import { Router, type IRouter } from "express";
import documentsRouter from "./documents";
import healthRouter from "./health";

const router: IRouter = Router();

router.use(healthRouter);
router.use(documentsRouter);

export default router;
