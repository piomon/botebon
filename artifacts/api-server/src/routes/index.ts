import { Router, type IRouter } from "express";
import healthRouter from "./health";
import participantsRouter from "./participants";
import operationsRouter from "./operations";

const router: IRouter = Router();

router.use(healthRouter);
router.use(participantsRouter);
router.use(operationsRouter);

export default router;
