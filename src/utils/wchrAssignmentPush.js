/ src/utils/wchrAssignmentPush.js

import { db } from "../firebase";

import {
  doc,
  getDoc,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";

// ============================================================
// CONFIG
// ============================================================

// Add this variable to your .env if the endpoint
// is different in Production:
//
// VITE_WCHR_ASSIGNMENT_PUSH_URL=https://YOUR-ENDPOINT
//
// If you already have one generic notifications endpoint,
// you can place that URL here instead.

const WCHR_ASSIGNMENT_PUSH_URL =
  import.meta.env.VITE_WCHR_ASSIGNMENT_PUSH_URL || "";

// ============================================================
// HELPERS
// ============================================================

function cleanText(value) {
  return String(value || "").trim();
}

function safeUpper(value) {
  return cleanText(value).toUpperCase();
}

function getAgentId(report) {
  return cleanText(
    report?.wchr_agent_id ||
      report?.assigned_agent_id ||
      ""
  );
}

function getAgentName(report) {
  return cleanText(
    report?.wchr_agent_name ||
      report?.assigned_wchr_agent ||
      "WCHR Agent"
  );
}

function getWheelchairNumber(report) {
  return safeUpper(
    report?.wheelchair_number || ""
  );
}

function getFlightLabel(report) {
  return [
    safeUpper(report?.airline),
    safeUpper(report?.flight_number),
  ]
    .filter(Boolean)
    .join(" ");
}

function getPickupLocation(report) {
  return cleanText(
    report?.current_location ||
      report?.ready_location ||
      "Counter"
  );
}

// ============================================================
// MARK PUSH RESULT
// ============================================================

async function markAssignmentPushResult(
  reportId,
  patch
) {
  if (!reportId) return;

  try {
    await updateDoc(
      doc(db, "wch_reports", reportId),
      {
        ...patch,
        assignmentPushUpdatedAt:
          serverTimestamp(),
      }
    );
  } catch (error) {
    console.warn(
      "Could not update WCHR assignment push status:",
      error
    );
  }
}

// ============================================================
// TRIGGER PUSH
// ============================================================

export async function triggerWchrAssignmentPush(
  reportId
) {
  const cleanReportId =
    cleanText(reportId);

  if (!cleanReportId) {
    console.warn(
      "triggerWchrAssignmentPush called without reportId."
    );

    return {
      success: false,
      skipped: true,
      reason: "MISSING_REPORT_ID",
    };
  }

  try {
    // ----------------------------------------------------------
    // LOAD REPORT
    // ----------------------------------------------------------

    const reportRef = doc(
      db,
      "wch_reports",
      cleanReportId
    );

    const reportSnap =
      await getDoc(reportRef);

    if (!reportSnap.exists()) {
      console.warn(
        "WCHR report not found:",
        cleanReportId
      );

      return {
        success: false,
        skipped: true,
        reason: "REPORT_NOT_FOUND",
      };
    }

    const report = {
      id: reportSnap.id,
      ...reportSnap.data(),
    };

    const agentId =
      getAgentId(report);

    if (!agentId) {
      await markAssignmentPushResult(
        cleanReportId,
        {
          assignmentPushStatus:
            "SKIPPED",

          assignmentPushError:
            "No assigned agent ID found.",
        }
      );

      return {
        success: false,
        skipped: true,
        reason: "NO_AGENT_ID",
      };
    }

    // ----------------------------------------------------------
    // LOAD AGENT SHIFT
    // ----------------------------------------------------------

    const shiftRef = doc(
      db,
      "wchr_agent_shifts",
      agentId
    );

    const shiftSnap =
      await getDoc(shiftRef);

    const shiftData =
      shiftSnap.exists()
        ? shiftSnap.data()
        : {};

    const linkedUserId =
      cleanText(
        shiftData.user_id ||
          shiftData.userId ||
          shiftData.aerostation_user_id ||
          ""
      );

    const agentEmployeeId =
      cleanText(
        shiftData.employee_id ||
          shiftData.employeeId ||
          agentId
      );

    const agentUsername =
      cleanText(
        shiftData.login_username ||
          shiftData.loginUsername ||
          shiftData.username ||
          ""
      );

    // ----------------------------------------------------------
    // BUILD MESSAGE
    // ----------------------------------------------------------

    const wheelchairNumber =
      getWheelchairNumber(report);

    const flightLabel =
      getFlightLabel(report);

    const passengerName =
      cleanText(
        report.passenger_name
      );

    const pickupLocation =
      getPickupLocation(report);

    const title =
      "New WCHR Assignment";

    const bodyParts = [
      wheelchairNumber
        ? `WCHR ${wheelchairNumber}`
        : "New wheelchair assignment",

      flightLabel || "",

      passengerName
        ? `Passenger: ${passengerName}`
        : "",

      pickupLocation
        ? `Pickup: ${pickupLocation}`
        : "",
    ].filter(Boolean);

    const body =
      bodyParts.join(" | ");

    // ----------------------------------------------------------
    // NO PUSH ENDPOINT
    // ----------------------------------------------------------

    if (!WCHR_ASSIGNMENT_PUSH_URL) {
      console.warn(
        "VITE_WCHR_ASSIGNMENT_PUSH_URL is not configured."
      );

      await markAssignmentPushResult(
        cleanReportId,
        {
          assignmentPushStatus:
            "NOT_CONFIGURED",

          assignmentPushError:
            "VITE_WCHR_ASSIGNMENT_PUSH_URL is missing.",
        }
      );

      return {
        success: false,
        skipped: true,
        reason:
          "PUSH_URL_NOT_CONFIGURED",
      };
    }

    // ----------------------------------------------------------
    // MARK PROCESSING
    // ----------------------------------------------------------

    await markAssignmentPushResult(
      cleanReportId,
      {
        assignmentPushStatus:
          "PROCESSING",

        assignmentPushError:
          "",

        assignmentPushTargetAgentId:
          agentId,

        assignmentPushTargetUserId:
          linkedUserId,

        assignmentPushTargetEmployeeId:
          agentEmployeeId,

        assignmentPushTargetUsername:
          agentUsername,
      }
    );

    // ----------------------------------------------------------
    // CALL SERVER
    // ----------------------------------------------------------

    const response =
      await fetch(
        WCHR_ASSIGNMENT_PUSH_URL,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            type:
              "WCHR_ASSIGNMENT",

            reportId:
              cleanReportId,

            reportDocId:
              cleanReportId,

            agentId,

            userId:
              linkedUserId,

            employeeId:
              agentEmployeeId,

            username:
              agentUsername,

            agentName:
              getAgentName(report),

            wheelchairNumber,

            passengerName,

            pnr:
              safeUpper(
                report.pnr
              ),

            airline:
              safeUpper(
                report.airline
              ),

            flightNumber:
              safeUpper(
                report.flight_number
              ),

            pickupLocation,

            title,

            body,

            targetPath:
              "/wchr/agent",

            data: {
              type:
                "WCHR_ASSIGNMENT",

              reportId:
                cleanReportId,

              wheelchairNumber,

              flightNumber:
                safeUpper(
                  report.flight_number
                ),

              pickupLocation,
            },
          }),
        }
      );

    // ----------------------------------------------------------
    // RESPONSE
    // ----------------------------------------------------------

    let responseData = {};

    try {
      responseData =
        await response.json();
    } catch {
      responseData = {};
    }

    if (!response.ok) {
      const serverError =
        cleanText(
          responseData?.error ||
            responseData?.message
        ) ||
        `Push endpoint returned HTTP ${response.status}.`;

      await markAssignmentPushResult(
        cleanReportId,
        {
          assignmentPushStatus:
            "FAILED",

          assignmentPushError:
            serverError,

          assignmentPushHttpStatus:
            response.status,
        }
      );

      console.error(
        "WCHR assignment push failed:",
        serverError
      );

      return {
        success: false,
        skipped: false,
        reason:
          "SERVER_ERROR",
        error:
          serverError,
      };
    }

    // ----------------------------------------------------------
    // SUCCESS
    // ----------------------------------------------------------

    const successCount =
      Number(
        responseData?.successCount ??
          responseData?.sent ??
          responseData?.success ??
          0
      ) || 0;

    const failureCount =
      Number(
        responseData?.failureCount ??
          responseData?.failed ??
          0
      ) || 0;

    await markAssignmentPushResult(
      cleanReportId,
      {
        assignmentPushStatus:
          "SENT",

        assignmentPushError:
          "",

        assignmentPushSentAt:
          serverTimestamp(),

        assignmentPushSuccessCount:
          successCount,

        assignmentPushFailureCount:
          failureCount,
      }
    );

    return {
      success: true,
      skipped: false,
      successCount,
      failureCount,
      response:
        responseData,
    };
  } catch (error) {
    console.error(
      "WCHR assignment push error:",
      error
    );

    await markAssignmentPushResult(
      cleanReportId,
      {
        assignmentPushStatus:
          "FAILED",

        assignmentPushError:
          error?.message ||
          "Unknown WCHR assignment push error.",
      }
    );

    return {
      success: false,
      skipped: false,
      reason:
        "UNEXPECTED_ERROR",
      error:
        error?.message ||
        "Unknown error",
    };
  }
}



// ============================================================
// DELIVERY / GATE NOTIFICATION TO ASSIGNING SUPERVISOR
// ============================================================

function getAssigningSupervisor(report) {
  return {
    userId: cleanText(
      report?.assigned_by_user_id ||
        report?.assigned_by_userId ||
        report?.assignedByUserId ||
        ""
    ),
    username: cleanText(
      report?.assigned_by_username ||
        report?.assignedByUsername ||
        ""
    ),
    name: cleanText(
      report?.assigned_by_name ||
        report?.assignedByName ||
        "WCHR Supervisor"
    ),
  };
}

async function markDeliveryPushResult(
  reportId,
  patch
) {
  if (!reportId) return;

  try {
    await updateDoc(
      doc(db, "wch_reports", reportId),
      {
        ...patch,
        deliveryPushUpdatedAt:
          serverTimestamp(),
      }
    );
  } catch (error) {
    console.warn(
      "Could not update WCHR delivery push status:",
      error
    );
  }
}

export async function triggerWchrDeliveryPush(
  reportId
) {
  const cleanReportId =
    cleanText(reportId);

  if (!cleanReportId) {
    return {
      success: false,
      skipped: true,
      reason: "MISSING_REPORT_ID",
    };
  }

  try {
    const reportSnap = await getDoc(
      doc(
        db,
        "wch_reports",
        cleanReportId
      )
    );

    if (!reportSnap.exists()) {
      return {
        success: false,
        skipped: true,
        reason: "REPORT_NOT_FOUND",
      };
    }

    const report = {
      id: reportSnap.id,
      ...reportSnap.data(),
    };

    const supervisor =
      getAssigningSupervisor(report);

    if (
      !supervisor.userId &&
      !supervisor.username
    ) {
      await markDeliveryPushResult(
        cleanReportId,
        {
          deliveryPushStatus: "SKIPPED",
          deliveryPushError:
            "No assigning supervisor user ID or username found on report.",
        }
      );

      return {
        success: false,
        skipped: true,
        reason:
          "NO_ASSIGNING_SUPERVISOR",
      };
    }

    if (!WCHR_ASSIGNMENT_PUSH_URL) {
      await markDeliveryPushResult(
        cleanReportId,
        {
          deliveryPushStatus:
            "NOT_CONFIGURED",
          deliveryPushError:
            "VITE_WCHR_ASSIGNMENT_PUSH_URL is missing.",
        }
      );

      return {
        success: false,
        skipped: true,
        reason:
          "PUSH_URL_NOT_CONFIGURED",
      };
    }

    const wheelchairNumber =
      getWheelchairNumber(report);

    const passengerName =
      cleanText(
        report.passenger_name
      );

    const flightLabel =
      getFlightLabel(report);

    const gateLocation =
      cleanText(
        report.gate_location ||
          report.current_location ||
          report.gate ||
          ""
      );

    const agentName =
      getAgentName(report);

    const title =
      "WCHR Delivered to Gate";

    const body = [
      wheelchairNumber
        ? `WCHR ${wheelchairNumber}`
        : "Wheelchair service",
      passengerName
        ? `Passenger: ${passengerName}`
        : "",
      agentName
        ? `Agent: ${agentName}`
        : "",
      flightLabel || "",
      gateLocation
        ? `Delivered: ${gateLocation}`
        : "",
    ]
      .filter(Boolean)
      .join(" | ");

    await markDeliveryPushResult(
      cleanReportId,
      {
        deliveryPushStatus:
          "PROCESSING",
        deliveryPushError: "",
        deliveryPushTargetUserId:
          supervisor.userId,
        deliveryPushTargetUsername:
          supervisor.username,
        deliveryPushTargetName:
          supervisor.name,
      }
    );

    const response = await fetch(
      WCHR_ASSIGNMENT_PUSH_URL,
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify({
          type:
            "WCHR_DELIVERED_TO_GATE",
          reportId:
            cleanReportId,
          reportDocId:
            cleanReportId,

          userId:
            supervisor.userId,
          username:
            supervisor.username,
          supervisorName:
            supervisor.name,

          wheelchairNumber,
          passengerName,
          agentName,
          airline:
            safeUpper(
              report.airline
            ),
          flightNumber:
            safeUpper(
              report.flight_number
            ),
          gateLocation,

          title,
          body,

          targetPath:
            "/wchr/dispatch",

          data: {
            type:
              "WCHR_DELIVERED_TO_GATE",
            reportId:
              cleanReportId,
            wheelchairNumber,
            gateLocation,
          },
        }),
      }
    );

    let responseData = {};

    try {
      responseData =
        await response.json();
    } catch {
      responseData = {};
    }

    if (!response.ok) {
      const serverError =
        cleanText(
          responseData?.error ||
            responseData?.message
        ) ||
        `Push endpoint returned HTTP ${response.status}.`;

      await markDeliveryPushResult(
        cleanReportId,
        {
          deliveryPushStatus:
            "FAILED",
          deliveryPushError:
            serverError,
          deliveryPushHttpStatus:
            response.status,
        }
      );

      return {
        success: false,
        skipped: false,
        reason: "SERVER_ERROR",
        error: serverError,
      };
    }

    const successCount =
      Number(
        responseData?.successCount ??
          responseData?.sent ??
          responseData?.success ??
          0
      ) || 0;

    const failureCount =
      Number(
        responseData?.failureCount ??
          responseData?.failed ??
          0
      ) || 0;

    await markDeliveryPushResult(
      cleanReportId,
      {
        deliveryPushStatus:
          "SENT",
        deliveryPushError: "",
        deliveryPushSentAt:
          serverTimestamp(),
        deliveryPushSuccessCount:
          successCount,
        deliveryPushFailureCount:
          failureCount,
      }
    );

    return {
      success: true,
      skipped: false,
      successCount,
      failureCount,
      response: responseData,
    };
  } catch (error) {
    console.error(
      "WCHR delivery push error:",
      error
    );

    await markDeliveryPushResult(
      cleanReportId,
      {
        deliveryPushStatus:
          "FAILED",
        deliveryPushError:
          error?.message ||
          "Unknown WCHR delivery push error.",
      }
    );

    return {
      success: false,
      skipped: false,
      reason:
        "UNEXPECTED_ERROR",
      error:
        error?.message ||
        "Unknown error",
    };
  }
}

// END wchrAssignmentPush.js
