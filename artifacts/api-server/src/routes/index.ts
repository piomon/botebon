import { Router, type IRouter } from "express";
import healthRouter from "./health";
import participantsRouter from "./participants";
import operationsRouter from "./operations";
import automationRouter from "./automation";

const router: IRouter = Router();

router.use(healthRouter);
router.use(participantsRouter);
router.use(operationsRouter);
router.use(automationRouter);

export default router;
