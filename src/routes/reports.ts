import { Router } from "express";
import { ReportController } from "../controller/report.controller";
import { authenticate, requireRole } from "../middlewares/auth.middleware";

const reportsRouter = Router();

reportsRouter.use(authenticate);
reportsRouter.post("/", ReportController.create);
reportsRouter.get("/me", ReportController.mine);
reportsRouter.get("/", requireRole("ADMIN"), ReportController.list);
reportsRouter.patch("/:reportId", requireRole("ADMIN"), ReportController.review);

export default reportsRouter;
