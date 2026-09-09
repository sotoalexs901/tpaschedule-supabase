// src/pages/WchrTrainingPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";

const LANGUAGES = {
  en: "English",
  es: "Español",
};

const SCENARIOS = {
  OB: {
    en: {
      title: "Outbound Training",
      subtitle: "Counter → Gate",
      description:
        "Practice the complete outbound WCHR flow from supervisor assignment to gate arrival.",
    },
    es: {
      title: "Entrenamiento de Salida",
      subtitle: "Counter → Gate",
      description:
        "Practica el flujo completo de WCHR de salida, desde la asignación del supervisor hasta la llegada al gate.",
    },
  },
  IB: {
    en: {
      title: "Inbound Training",
      subtitle: "CBP → Destination → Storage",
      description:
        "Practice the inbound WCHR flow from passenger acceptance at CBP to final delivery and wheelchair storage.",
    },
    es: {
      title: "Entrenamiento de Llegada",
      subtitle: "CBP → Destino → Storage",
      description:
        "Practica el flujo de WCHR de llegada, desde aceptar al pasajero en CBP hasta la entrega final y almacenamiento de la silla.",
    },
  },
};

const OB_STEPS = [
  {
    key: "supervisor_assigns",
    emoji: "\u{1F468}\u200D\u{1F4BC} \u279C \u{1F9D1}\u200D\u{1F9BD} \u279C \u{1F464}",
    status: "ASSIGNED",
    en: {
      title: "Supervisor Assigns the WCHR Service",
      description:
        "The supervisor assigns the passenger and wheelchair service to the WCHR agent before the agent begins transport.",
      instruction:
        "The agent should review the assignment details before taking any action.",
      prompt: "What should the agent do first?",
      options: [
        { label: "Accept Assignment", correct: true },
        { label: "Start Transit", correct: false },
        { label: "Arrived at Gate", correct: false },
      ],
      success:
        "Correct. The agent must first accept the assignment before beginning the service.",
      error:
        "Not yet. The service must first be accepted by the assigned agent.",
    },
    es: {
      title: "El Supervisor Asigna el Servicio WCHR",
      description:
        "El supervisor asigna el pasajero y el servicio de silla de ruedas al agente WCHR antes de comenzar el traslado.",
      instruction:
        "El agente debe revisar los detalles de la asignación antes de realizar cualquier acción.",
      prompt: "¿Qué debe hacer primero el agente?",
      options: [
        { label: "Accept Assignment", correct: true },
        { label: "Start Transit", correct: false },
        { label: "Arrived at Gate", correct: false },
      ],
      success:
        "Correcto. El agente debe aceptar la asignación antes de comenzar el servicio.",
      error:
        "Todavía no. Primero el agente asignado debe aceptar el servicio.",
    },
  },
  {
    key: "accept_assignment",
    emoji: "\u{1F4F1} \u2705 \u{1F464}",
    status: "ACCEPTED",
    en: {
      title: "Agent Accepts the Assignment",
      description:
        "The assignment appears in My Active Assignment. The agent presses Accept Assignment.",
      instruction:
        "Once accepted, the assignment belongs to that agent and the service can continue.",
      prompt: "After accepting, where should the agent go?",
      options: [
        { label: "Counter / Pickup Location", correct: true },
        { label: "Gate", correct: false },
        { label: "Storage", correct: false },
      ],
      success:
        "Correct. The agent should proceed to the passenger pickup location.",
      error:
        "Incorrect. The passenger must be picked up at the assigned pickup location first.",
    },
    es: {
      title: "El Agente Acepta la Asignación",
      description:
        "La asignación aparece en My Active Assignment. El agente presiona Accept Assignment.",
      instruction:
        "Una vez aceptado, el servicio queda asignado a ese agente y puede continuar.",
      prompt: "Después de aceptar, ¿a dónde debe ir el agente?",
      options: [
        { label: "Counter / Lugar de Pickup", correct: true },
        { label: "Gate", correct: false },
        { label: "Storage", correct: false },
      ],
      success:
        "Correcto. El agente debe dirigirse al lugar donde recogerá al pasajero.",
      error:
        "Incorrecto. Primero debe recoger al pasajero en el lugar asignado.",
    },
  },
  {
    key: "pickup",
    emoji: "\u{1F3AB} \u{1F464} \u{1F9D1}\u200D\u{1F9BD}",
    status: "AT PICKUP",
    en: {
      title: "Pick Up the Passenger",
      description:
        "The agent arrives at the Counter or assigned pickup location and physically receives the passenger.",
      instruction:
        "Press Pick Up only when the passenger is physically with the agent.",
      prompt: "When should Pick Up be pressed?",
      options: [
        { label: "When the passenger is physically with the agent", correct: true },
        { label: "While walking to the Counter", correct: false },
        { label: "After arriving at the Gate", correct: false },
      ],
      success:
        "Correct. Pick Up confirms that the passenger is physically in the agent's care.",
      error:
        "Incorrect. Pick Up should only be confirmed when the passenger is physically with the agent.",
    },
    es: {
      title: "Recoger al Pasajero",
      description:
        "El agente llega al Counter o lugar de recogida asignado y recibe físicamente al pasajero.",
      instruction:
        "Presiona Pick Up solamente cuando el pasajero esté físicamente con el agente.",
      prompt: "¿Cuándo se debe presionar Pick Up?",
      options: [
        { label: "Cuando el pasajero esté físicamente con el agente", correct: true },
        { label: "Mientras camina hacia el Counter", correct: false },
        { label: "Después de llegar al Gate", correct: false },
      ],
      success:
        "Correcto. Pick Up confirma que el pasajero está físicamente bajo el cuidado del agente.",
      error:
        "Incorrecto. Pick Up solo se confirma cuando el pasajero está físicamente con el agente.",
    },
  },
  {
    key: "start_transit",
    emoji: "\u{1F3AB} --- \u{1F464}\u{1F9D1}\u200D\u{1F9BD} --- \u2708\uFE0F",
    status: "IN TRANSIT",
    en: {
      title: "Start Transit",
      description:
        "The agent begins moving the passenger from the Counter toward the Gate.",
      instruction:
        "Press Start Transit only when physically leaving the pickup location with the passenger.",
      prompt: "What does Start Transit represent?",
      options: [
        { label: "The real beginning of passenger transport", correct: true },
        { label: "The time the supervisor created the assignment", correct: false },
        { label: "The time the passenger boards the aircraft", correct: false },
      ],
      success:
        "Correct. This is the real start of the transport segment.",
      error:
        "Incorrect. Start Transit represents the real physical beginning of the passenger movement.",
    },
    es: {
      title: "Comenzar el Traslado",
      description:
        "El agente comienza a trasladar al pasajero desde el Counter hacia el Gate.",
      instruction:
        "Presiona Start Transit solamente cuando salgas físicamente del punto de recogida con el pasajero.",
      prompt: "¿Qué representa Start Transit?",
      options: [
        { label: "El inicio real del traslado del pasajero", correct: true },
        { label: "La hora en que el supervisor creó la asignación", correct: false },
        { label: "La hora en que el pasajero aborda el avión", correct: false },
      ],
      success:
        "Correcto. Este es el inicio real del segmento de transporte.",
      error:
        "Incorrecto. Start Transit representa el momento real en que comienza el movimiento del pasajero.",
    },
  },
  {
    key: "journey",
    emoji: "\u{1F464}\u{1F9D1}\u200D\u{1F9BD} \u27A1\uFE0F \u27A1\uFE0F \u27A1\uFE0F \u2708\uFE0F",
    status: "IN TRANSIT",
    en: {
      title: "Transport the Passenger to the Gate",
      description:
        "The agent continues the passenger movement toward the assigned gate.",
      instruction:
        "Use location updates when required and continue monitoring the active service timer.",
      prompt: "What should the agent do if the service is taking longer than expected?",
      options: [
        { label: "Continue the service and update the journey/location", correct: true },
        { label: "End the service before reaching the Gate", correct: false },
        { label: "Store the WCHR immediately", correct: false },
      ],
      success:
        "Correct. Continue the active service and keep the journey information current.",
      error:
        "Incorrect. The passenger service remains active until arrival at the Gate.",
    },
    es: {
      title: "Trasladar al Pasajero Hacia el Gate",
      description:
        "El agente continúa el movimiento del pasajero hacia el gate asignado.",
      instruction:
        "Utiliza las actualizaciones de ubicación cuando sean necesarias y continúa monitoreando el tiempo del servicio.",
      prompt: "¿Qué debe hacer el agente si el servicio está demorando más de lo esperado?",
      options: [
        { label: "Continuar el servicio y actualizar la ubicación", correct: true },
        { label: "Terminar el servicio antes de llegar al Gate", correct: false },
        { label: "Guardar la silla inmediatamente", correct: false },
      ],
      success:
        "Correcto. El servicio debe continuar activo y la información de ubicación debe mantenerse actualizada.",
      error:
        "Incorrecto. El servicio continúa activo hasta llegar al Gate.",
    },
  },
  {
    key: "arrived_gate",
    emoji: "\u2708\uFE0F \u2705 \u{1F464}",
    status: "AT GATE",
    en: {
      title: "Arrived at Gate",
      description:
        "The passenger has physically arrived at the assigned gate.",
      instruction:
        "Press Arrived at Gate only after the passenger is physically at the gate.",
      prompt: "What happens after Arrived at Gate?",
      options: [
        { label: "The agent becomes available for another transport assignment", correct: true },
        { label: "The passenger is automatically boarded", correct: false },
        { label: "The wheelchair is automatically stored", correct: false },
      ],
      success:
        "Correct. The transport segment is complete and the agent can return to availability.",
      error:
        "Incorrect. Arrived at Gate completes the transport segment but does not automatically board the passenger.",
    },
    es: {
      title: "Llegada al Gate",
      description:
        "El pasajero ha llegado físicamente al gate asignado.",
      instruction:
        "Presiona Arrived at Gate solamente después de que el pasajero esté físicamente en el gate.",
      prompt: "¿Qué ocurre después de Arrived at Gate?",
      options: [
        { label: "El agente vuelve a estar disponible para otro traslado", correct: true },
        { label: "El pasajero se marca automáticamente como abordado", correct: false },
        { label: "La silla se guarda automáticamente", correct: false },
      ],
      success:
        "Correcto. El segmento de transporte termina y el agente puede volver a estar disponible.",
      error:
        "Incorrecto. Arrived at Gate termina el traslado, pero no aborda automáticamente al pasajero.",
    },
  },
];

const IB_STEPS = [
  {
    key: "supervisor_prepares",
    emoji: "\u{1F468}\u200D\u{1F4BC} \u{1F4DD} \u{1F6EC}",
    status: "IB WAITING",
    en: {
      title: "Supervisor Prepares the IB Passenger",
      description:
        "Before arrival, the supervisor enters the inbound passenger in the system so the passenger becomes visible to WCHR agents.",
      instruction:
        "The passenger remains available until an eligible agent accepts the service.",
      prompt: "What should the agent do when the passenger appears in Available CBP Passengers?",
      options: [
        { label: "Accept Pax", correct: true },
        { label: "Delivered", correct: false },
        { label: "Store WCHR", correct: false },
      ],
      success:
        "Correct. The passenger must first be accepted by an available agent.",
      error:
        "Incorrect. The agent must first accept the inbound passenger.",
    },
    es: {
      title: "El Supervisor Prepara al Pasajero IB",
      description:
        "Antes del arribo, el supervisor ingresa al pasajero inbound en el sistema para que quede visible para los agentes WCHR.",
      instruction:
        "El pasajero permanece disponible hasta que un agente elegible acepte el servicio.",
      prompt: "¿Qué debe hacer el agente cuando el pasajero aparece en Available CBP Passengers?",
      options: [
        { label: "Accept Pax", correct: true },
        { label: "Delivered", correct: false },
        { label: "Store WCHR", correct: false },
      ],
      success:
        "Correcto. Primero el pasajero debe ser aceptado por un agente disponible.",
      error:
        "Incorrecto. El agente debe aceptar primero al pasajero inbound.",
    },
  },
  {
    key: "accept_pax",
    emoji: "\u{1F64B} \u2705 \u{1F6EC}",
    status: "IB ACCEPTED",
    en: {
      title: "Accept Pax",
      description:
        "The agent selects the inbound passenger from the available list and presses Accept Pax.",
      instruction:
        "Accepting the passenger reserves the service to that agent. The timer does not begin yet.",
      prompt: "Does the transit timer start when Accept Pax is pressed?",
      options: [
        { label: "No", correct: true },
        { label: "Yes", correct: false },
      ],
      success:
        "Correct. Accept Pax reserves the passenger, but the real transit timer has not started.",
      error:
        "Incorrect. The timer starts later, when the agent physically leaves CBP with the passenger.",
    },
    es: {
      title: "Aceptar al Pasajero",
      description:
        "El agente selecciona al pasajero inbound de la lista disponible y presiona Accept Pax.",
      instruction:
        "Aceptar al pasajero reserva el servicio a ese agente. El timer todavía no comienza.",
      prompt: "¿Comienza el timer de traslado al presionar Accept Pax?",
      options: [
        { label: "No", correct: true },
        { label: "Sí", correct: false },
      ],
      success:
        "Correcto. Accept Pax reserva al pasajero, pero el timer real todavía no comienza.",
      error:
        "Incorrecto. El timer comienza después, cuando el agente sale físicamente de CBP con el pasajero.",
    },
  },
  {
    key: "select_wchr",
    emoji: "\u{1F9D1}\u200D\u{1F9BD} \u{1F522} \u2705",
    status: "WCHR SELECTED",
    en: {
      title: "Select the WCHR Number",
      description:
        "The agent selects an available wheelchair number from inventory.",
      instruction:
        "The wheelchair number is selected from the system list. It should not be manually typed.",
      prompt: "Which wheelchair should the agent select?",
      options: [
        { label: "A WCHR marked AVAILABLE in inventory", correct: true },
        { label: "Any wheelchair number the agent remembers", correct: false },
        { label: "A wheelchair already assigned to another service", correct: false },
      ],
      success:
        "Correct. Only an available wheelchair should be selected.",
      error:
        "Incorrect. The wheelchair must be available in inventory.",
    },
    es: {
      title: "Seleccionar el Número de WCHR",
      description:
        "El agente selecciona un número de silla disponible desde el inventario.",
      instruction:
        "El número de la silla se selecciona desde la lista del sistema. No debe escribirse manualmente.",
      prompt: "¿Qué silla debe seleccionar el agente?",
      options: [
        { label: "Una WCHR marcada AVAILABLE en inventario", correct: true },
        { label: "Cualquier número que el agente recuerde", correct: false },
        { label: "Una silla ya asignada a otro servicio", correct: false },
      ],
      success:
        "Correcto. Solo debe seleccionarse una silla disponible.",
      error:
        "Incorrecto. La silla debe estar disponible en inventario.",
    },
  },
  {
    key: "destination",
    emoji: "\u{1F4CD} \u{1F3E2} \u{1F697}",
    status: "DESTINATION SET",
    en: {
      title: "Select the Final Destination",
      description:
        "The agent selects where the inbound passenger must be delivered.",
      instruction:
        "Available destinations can include Main Terminal, Rental Car, First Floor Red Side and First Floor Blue Side.",
      prompt: "When should the destination be selected?",
      options: [
        { label: "Before starting transit from CBP", correct: true },
        { label: "Only after Store WCHR", correct: false },
        { label: "After the agent punches out", correct: false },
      ],
      success:
        "Correct. The destination should be selected before Start Transit.",
      error:
        "Incorrect. The final destination must be known before the passenger begins transit.",
    },
    es: {
      title: "Seleccionar el Destino Final",
      description:
        "El agente selecciona dónde debe ser entregado el pasajero inbound.",
      instruction:
        "Los destinos pueden incluir Main Terminal, Rental Car, First Floor Red Side y First Floor Blue Side.",
      prompt: "¿Cuándo debe seleccionarse el destino?",
      options: [
        { label: "Antes de comenzar el traslado desde CBP", correct: true },
        { label: "Solamente después de Store WCHR", correct: false },
        { label: "Después de que el agente haga Punch Out", correct: false },
      ],
      success:
        "Correcto. El destino debe seleccionarse antes de Start Transit.",
      error:
        "Incorrecto. El destino final debe conocerse antes de comenzar el traslado.",
    },
  },
  {
    key: "ib_start_transit",
    emoji: "\u{1F6C3} \u{1F464}\u{1F9D1}\u200D\u{1F9BD} \u27A1\uFE0F",
    status: "IB IN TRANSIT",
    en: {
      title: "Start Transit at CBP",
      description:
        "The agent physically leaves CBP with the passenger and begins movement toward the selected destination.",
      instruction:
        "This is the moment the real CBP-to-destination timer begins.",
      prompt: "When should Start Transit be pressed?",
      options: [
        { label: "When physically leaving CBP with the passenger", correct: true },
        { label: "When the passenger first appears in the system", correct: false },
        { label: "After the passenger is delivered", correct: false },
      ],
      success:
        "Correct. Start Transit must match the real physical start of movement from CBP.",
      error:
        "Incorrect. Start Transit begins only when the agent physically leaves CBP with the passenger.",
    },
    es: {
      title: "Comenzar el Traslado desde CBP",
      description:
        "El agente sale físicamente de CBP con el pasajero y comienza el movimiento hacia el destino seleccionado.",
      instruction:
        "Este es el momento en que comienza el timer real CBP → destino.",
      prompt: "¿Cuándo se debe presionar Start Transit?",
      options: [
        { label: "Cuando se sale físicamente de CBP con el pasajero", correct: true },
        { label: "Cuando el pasajero aparece por primera vez en el sistema", correct: false },
        { label: "Después de entregar al pasajero", correct: false },
      ],
      success:
        "Correcto. Start Transit debe coincidir con el inicio físico real del movimiento desde CBP.",
      error:
        "Incorrecto. Start Transit comienza solamente cuando el agente sale físicamente de CBP con el pasajero.",
    },
  },
  {
    key: "ib_journey",
    emoji: "\u{1F6C3} --- \u{1F464}\u{1F9D1}\u200D\u{1F9BD} --- \u{1F3E2}",
    status: "IB IN TRANSIT",
    en: {
      title: "Transport Passenger to Destination",
      description:
        "The agent continues the inbound passenger transport to the selected final destination.",
      instruction:
        "The service remains active while the passenger is in transit.",
      prompt: "What should happen if the service exceeds 30 minutes?",
      options: [
        { label: "Continue the service and follow the operational alert process", correct: true },
        { label: "Mark the passenger delivered immediately", correct: false },
        { label: "Release the wheelchair before arrival", correct: false },
      ],
      success:
        "Correct. The service remains active until the passenger is physically delivered.",
      error:
        "Incorrect. The service must remain active until actual delivery.",
    },
    es: {
      title: "Trasladar al Pasajero al Destino",
      description:
        "El agente continúa el traslado del pasajero inbound hasta el destino final seleccionado.",
      instruction:
        "El servicio permanece activo mientras el pasajero está en tránsito.",
      prompt: "¿Qué debe ocurrir si el servicio supera los 30 minutos?",
      options: [
        { label: "Continuar el servicio y seguir el proceso de alerta operacional", correct: true },
        { label: "Marcar al pasajero como entregado inmediatamente", correct: false },
        { label: "Liberar la silla antes de llegar", correct: false },
      ],
      success:
        "Correcto. El servicio permanece activo hasta que el pasajero sea entregado físicamente.",
      error:
        "Incorrecto. El servicio debe permanecer activo hasta la entrega real.",
    },
  },
  {
    key: "delivered",
    emoji: "\u{1F3C1} \u{1F464} \u2705 \u{1F9D1}\u200D\u{1F9BD}",
    status: "PENDING STORAGE",
    en: {
      title: "Delivered",
      description:
        "The passenger has been physically delivered to the selected final destination.",
      instruction:
        "Press Delivered to stop the CBP-to-destination transit timer.",
      prompt: "Is the wheelchair immediately available after Delivered?",
      options: [
        { label: "No, it remains PENDING STORAGE", correct: true },
        { label: "Yes, immediately", correct: false },
      ],
      success:
        "Correct. Passenger delivery is complete, but the wheelchair remains assigned until storage is confirmed.",
      error:
        "Incorrect. Delivered stops the passenger transit timer, but the WCHR is still pending storage.",
    },
    es: {
      title: "Pasajero Entregado",
      description:
        "El pasajero ha sido entregado físicamente en el destino final seleccionado.",
      instruction:
        "Presiona Delivered para detener el timer CBP → destino.",
      prompt: "¿La silla queda disponible inmediatamente después de Delivered?",
      options: [
        { label: "No, permanece PENDING STORAGE", correct: true },
        { label: "Sí, inmediatamente", correct: false },
      ],
      success:
        "Correcto. La entrega del pasajero termina, pero la silla sigue asignada hasta confirmar el storage.",
      error:
        "Incorrecto. Delivered detiene el timer del pasajero, pero la WCHR todavía está pendiente de storage.",
    },
  },
  {
    key: "storage",
    emoji: "\u{1F9D1}\u200D\u{1F9BD} \u27A1\uFE0F \u{1F17F}\uFE0F",
    status: "PENDING STORAGE",
    en: {
      title: "Store the WCHR",
      description:
        "The agent physically moves the wheelchair to its real storage location.",
      instruction:
        "Select the actual storage location, then press Store WCHR.",
      prompt: "When should Store WCHR be pressed?",
      options: [
        { label: "Only after the chair is physically stored", correct: true },
        { label: "Immediately after Accept Pax", correct: false },
        { label: "Before passenger delivery", correct: false },
      ],
      success:
        "Correct. Store WCHR confirms the chair's real physical storage location.",
      error:
        "Incorrect. Store WCHR should only be used after the chair is physically stored.",
    },
    es: {
      title: "Guardar la WCHR",
      description:
        "El agente mueve físicamente la silla hasta su ubicación real de almacenamiento.",
      instruction:
        "Selecciona la ubicación real de storage y luego presiona Store WCHR.",
      prompt: "¿Cuándo debe presionarse Store WCHR?",
      options: [
        { label: "Solamente después de guardar físicamente la silla", correct: true },
        { label: "Inmediatamente después de Accept Pax", correct: false },
        { label: "Antes de entregar al pasajero", correct: false },
      ],
      success:
        "Correcto. Store WCHR confirma la ubicación física real donde quedó almacenada la silla.",
      error:
        "Incorrecto. Store WCHR solo debe usarse después de guardar físicamente la silla.",
    },
  },
  {
    key: "available",
    emoji: "\u{1F9D1}\u200D\u{1F9BD} \u2705   \u{1F464} \u2705",
    status: "AVAILABLE",
    en: {
      title: "WCHR and Agent Available",
      description:
        "After Store WCHR, the wheelchair returns to AVAILABLE inventory and the agent becomes AVAILABLE for another service.",
      instruction:
        "The inbound service is now fully complete.",
      prompt: "What is the final correct status?",
      options: [
        { label: "WCHR AVAILABLE + Agent AVAILABLE", correct: true },
        { label: "WCHR PENDING STORAGE + Agent BUSY", correct: false },
      ],
      success:
        "Correct. The complete inbound process is finished.",
      error:
        "Incorrect. The service is only complete after both the WCHR and agent return to AVAILABLE.",
    },
    es: {
      title: "WCHR y Agente Disponibles",
      description:
        "Después de Store WCHR, la silla vuelve a AVAILABLE en inventario y el agente queda AVAILABLE para otro servicio.",
      instruction:
        "El servicio inbound está completamente terminado.",
      prompt: "¿Cuál es el estado final correcto?",
      options: [
        { label: "WCHR AVAILABLE + Agent AVAILABLE", correct: true },
        { label: "WCHR PENDING STORAGE + Agent BUSY", correct: false },
      ],
      success:
        "Correcto. El proceso inbound completo ha terminado.",
      error:
        "Incorrecto. El servicio solo termina cuando tanto la WCHR como el agente vuelven a AVAILABLE.",
    },
  },
];

function PageCard({ children, style = {} }) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.95)",
        border: "1px solid rgba(255,255,255,0.98)",
        borderRadius: 24,
        boxShadow: "0 18px 42px rgba(15,23,42,0.07)",
        minWidth: 0,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function TrainingButton({
  children,
  onClick,
  variant = "primary",
  disabled = false,
  style = {},
}) {
  const variants = {
    primary: {
      background:
        "linear-gradient(135deg, #0f4c81 0%, #1769aa 58%, #4fb6e9 100%)",
      color: "#fff",
      border: "none",
    },
    secondary: {
      background: "#ffffff",
      color: "#1769aa",
      border: "1px solid #bfdbfe",
    },
    success: {
      background: "#16a34a",
      color: "#fff",
      border: "none",
    },
    warning: {
      background: "#f59e0b",
      color: "#fff",
      border: "none",
    },
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        borderRadius: 14,
        padding: "11px 15px",
        fontSize: 13,
        fontWeight: 900,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
        transition: "all 0.2s ease",
        boxShadow:
          variant === "primary" || variant === "success"
            ? "0 10px 22px rgba(23,105,170,0.16)"
            : "none",
        ...variants[variant],
        ...style,
      }}
    >
      {children}
    </button>
  );
}

function ScenarioCard({ icon, title, subtitle, description, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: "100%",
        textAlign: "left",
        border: "1px solid #dbeafe",
        background: "linear-gradient(135deg, #f8fbff 0%, #ffffff 100%)",
        borderRadius: 20,
        padding: 18,
        cursor: "pointer",
        fontFamily: "inherit",
        boxShadow: "0 10px 24px rgba(15,23,42,0.05)",
      }}
    >
      <div style={{ fontSize: 30 }}>{icon}</div>
      <div
        style={{
          marginTop: 10,
          fontSize: 18,
          fontWeight: 900,
          color: "#0f172a",
        }}
      >
        {title}
      </div>
      <div
        style={{
          marginTop: 3,
          fontSize: 13,
          fontWeight: 800,
          color: "#1769aa",
        }}
      >
        {subtitle}
      </div>
      <div
        style={{
          marginTop: 8,
          fontSize: 13,
          color: "#64748b",
          lineHeight: 1.6,
        }}
      >
        {description}
      </div>
    </button>
  );
}


function TrainingVisual({ scenario, stepKey, language }) {
  const isSpanish = language === "es";

  const ICONS = {
    supervisor: "\u{1F468}\u200D\u{1F4BC}",
    agent: "\u{1F464}",
    wheelchair: "\u{1F9D1}\u200D\u{1F9BD}",
    passenger: "\u{1F9CD}",
    phone: "\u{1F4F1}",
    counter: "\u{1F3AB}",
    gate: "\u2708\uFE0F",
    cbp: "\u{1F6C3}",
    building: "\u{1F3E2}",
    rental: "\u{1F697}",
    storage: "\u{1F17F}\uFE0F",
    check: "\u2705",
    arrow: "\u27A1\uFE0F",
  };

  const obTransitPosition = {
    start_transit: "25%",
    journey: "62%",
    arrived_gate: "88%",
  };

  const ibTransitPosition = {
    ib_start_transit: "24%",
    ib_journey: "62%",
    delivered: "88%",
  };

  const shell = {
    borderRadius: 20,
    border: "1px solid #dbeafe",
    background:
      "linear-gradient(135deg, #f8fbff 0%, #ffffff 52%, #eff6ff 100%)",
    padding: 18,
    overflow: "hidden",
    position: "relative",
  };

  const stationBox = {
    width: 118,
    minHeight: 82,
    borderRadius: 16,
    border: "1px solid #bfdbfe",
    background: "#ffffff",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    padding: 10,
    boxShadow: "0 8px 18px rgba(15,23,42,0.05)",
    zIndex: 2,
  };

  const labelStyle = {
    fontSize: 11,
    color: "#475569",
    fontWeight: 900,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    textAlign: "center",
  };

  if (scenario === "OB" && stepKey === "supervisor_assigns") {
    return (
      <div style={shell}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto 1fr auto 1fr",
            gap: 10,
            alignItems: "center",
          }}
        >
          <div style={stationBox}>
            <div style={{ fontSize: 34 }}>{ICONS.supervisor}</div>
            <div style={labelStyle}>
              {isSpanish ? "Supervisor" : "Supervisor"}
            </div>
          </div>

          <div style={{ fontSize: 24 }}>{ICONS.arrow}</div>

          <div
            style={{
              ...stationBox,
              background: "#edf7ff",
            }}
          >
            <div style={{ fontSize: 30 }}>{ICONS.phone}</div>
            <div style={labelStyle}>
              {isSpanish ? "Nueva Asignacion" : "New Assignment"}
            </div>
            <div
              style={{
                fontSize: 10,
                color: "#1769aa",
                fontWeight: 900,
                textAlign: "center",
              }}
            >
              WCHR #12
            </div>
          </div>

          <div style={{ fontSize: 24 }}>{ICONS.arrow}</div>

          <div style={stationBox}>
            <div style={{ fontSize: 34 }}>{ICONS.agent}</div>
            <div style={labelStyle}>
              {isSpanish ? "Agente WCHR" : "WCHR Agent"}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (scenario === "OB" && stepKey === "accept_assignment") {
    return (
      <div style={shell}>
        <div
          style={{
            maxWidth: 360,
            margin: "0 auto",
            background: "#ffffff",
            border: "1px solid #bfdbfe",
            borderRadius: 20,
            padding: 16,
            boxShadow: "0 12px 26px rgba(15,23,42,0.06)",
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 900,
              color: "#1769aa",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            My Active Assignment
          </div>
          <div style={{ marginTop: 10, fontSize: 24 }}>
            {ICONS.phone} {ICONS.wheelchair}
          </div>
          <div
            style={{
              marginTop: 8,
              fontSize: 15,
              fontWeight: 900,
              color: "#0f172a",
            }}
          >
            WCHR #12 · Passenger Ready
          </div>
          <div
            style={{
              marginTop: 5,
              fontSize: 12,
              color: "#64748b",
            }}
          >
            {isSpanish ? "Pickup: Counter" : "Pickup: Counter"}
          </div>
          <div
            style={{
              marginTop: 12,
              padding: "10px 12px",
              borderRadius: 12,
              background: "#ecfdf5",
              border: "1px solid #a7f3d0",
              color: "#047857",
              fontWeight: 900,
              textAlign: "center",
            }}
          >
            {ICONS.check} Accept Assignment
          </div>
        </div>
      </div>
    );
  }

  if (scenario === "OB" && stepKey === "pickup") {
    return (
      <div style={shell}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            minHeight: 120,
          }}
        >
          <div style={stationBox}>
            <div style={{ fontSize: 32 }}>{ICONS.counter}</div>
            <div style={labelStyle}>Counter</div>
            <div style={{ fontSize: 26 }}>{ICONS.passenger}</div>
          </div>

          <div
            style={{
              fontSize: 34,
              animation: "wchrAgentApproach 1.8s ease-in-out infinite alternate",
              whiteSpace: "nowrap",
            }}
          >
            {ICONS.agent} {ICONS.wheelchair} {ICONS.arrow}
          </div>

          <div
            style={{
              ...stationBox,
              background: "#ecfdf5",
              border: "1px solid #a7f3d0",
            }}
          >
            <div style={{ fontSize: 28 }}>{ICONS.check}</div>
            <div style={{ ...labelStyle, color: "#047857" }}>Pick Up</div>
          </div>
        </div>
      </div>
    );
  }

  if (
    scenario === "OB" &&
    ["start_transit", "journey", "arrived_gate"].includes(stepKey)
  ) {
    const left = obTransitPosition[stepKey] || "25%";
    return (
      <div style={{ ...shell, minHeight: 170 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            position: "relative",
            minHeight: 130,
          }}
        >
          <div style={stationBox}>
            <div style={{ fontSize: 32 }}>{ICONS.counter}</div>
            <div style={labelStyle}>Counter</div>
          </div>

          <div
            style={{
              position: "absolute",
              left: 96,
              right: 96,
              top: 67,
              height: 4,
              borderRadius: 999,
              background:
                "linear-gradient(90deg, #bfdbfe 0%, #5aa9e6 55%, #1769aa 100%)",
            }}
          />

          <div
            style={{
              position: "absolute",
              left,
              top: 44,
              transform: "translateX(-50%)",
              fontSize: 33,
              whiteSpace: "nowrap",
              transition: "left 0.8s ease",
              animation:
                stepKey === "journey"
                  ? "wchrTransitPulse 1.4s ease-in-out infinite"
                  : "none",
              zIndex: 3,
            }}
          >
            {ICONS.agent}{ICONS.wheelchair}{ICONS.passenger}
          </div>

          <div
            style={{
              position: "absolute",
              left: "50%",
              transform: "translateX(-50%)",
              top: 84,
              fontSize: 11,
              color: "#64748b",
              fontWeight: 900,
              background: "#ffffff",
              padding: "4px 8px",
              borderRadius: 999,
              border: "1px solid #dbeafe",
              zIndex: 2,
            }}
          >
            {stepKey === "arrived_gate"
              ? isSpanish
                ? "Llegada confirmada"
                : "Arrival confirmed"
              : isSpanish
              ? "Timer de traslado activo"
              : "Transit timer active"}
          </div>

          <div style={stationBox}>
            <div style={{ fontSize: 32 }}>{ICONS.gate}</div>
            <div style={labelStyle}>Gate</div>
          </div>
        </div>
      </div>
    );
  }

  if (scenario === "IB" && stepKey === "supervisor_prepares") {
    return (
      <div style={shell}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto 1fr",
            gap: 12,
            alignItems: "center",
          }}
        >
          <div style={stationBox}>
            <div style={{ fontSize: 34 }}>{ICONS.supervisor}</div>
            <div style={labelStyle}>Supervisor</div>
          </div>
          <div style={{ fontSize: 25 }}>{ICONS.arrow}</div>
          <div
            style={{
              ...stationBox,
              minWidth: 190,
              background: "#edf7ff",
            }}
          >
            <div style={{ fontSize: 31 }}>{ICONS.cbp} {ICONS.passenger}</div>
            <div style={labelStyle}>
              {isSpanish ? "Pasajero IB Disponible" : "IB Passenger Available"}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (scenario === "IB" && stepKey === "accept_pax") {
    return (
      <div style={shell}>
        <div
          style={{
            maxWidth: 390,
            margin: "0 auto",
            border: "1px solid #bfdbfe",
            borderRadius: 18,
            background: "#fff",
            padding: 16,
          }}
        >
          <div style={{ ...labelStyle, color: "#1769aa" }}>
            Available CBP Passengers
          </div>
          <div style={{ marginTop: 10, fontSize: 29 }}>
            {ICONS.cbp} {ICONS.passenger}
          </div>
          <div
            style={{
              marginTop: 8,
              fontWeight: 900,
              color: "#0f172a",
            }}
          >
            Maria Perez · IB Arrival
          </div>
          <div
            style={{
              marginTop: 12,
              padding: "10px 12px",
              borderRadius: 12,
              background: "#ecfdf5",
              border: "1px solid #a7f3d0",
              textAlign: "center",
              color: "#047857",
              fontWeight: 900,
            }}
          >
            {ICONS.check} Accept Pax
          </div>
        </div>
      </div>
    );
  }

  if (scenario === "IB" && stepKey === "select_wchr") {
    return (
      <div style={shell}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0,1fr))",
            gap: 10,
          }}
        >
          {[12, 18, 27].map((number) => (
            <div
              key={number}
              style={{
                padding: 14,
                borderRadius: 16,
                background: number === 12 ? "#ecfdf5" : "#ffffff",
                border:
                  number === 12
                    ? "1px solid #86efac"
                    : "1px solid #dbeafe",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: 28 }}>{ICONS.wheelchair}</div>
              <div
                style={{
                  marginTop: 5,
                  fontSize: 13,
                  fontWeight: 900,
                  color: number === 12 ? "#047857" : "#334155",
                }}
              >
                WCHR #{number}
              </div>
              <div
                style={{
                  marginTop: 3,
                  fontSize: 10,
                  color: "#64748b",
                  fontWeight: 800,
                }}
              >
                AVAILABLE
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (scenario === "IB" && stepKey === "destination") {
    const destinations = [
      [ICONS.building, "Main Terminal"],
      [ICONS.rental, "Rental Car"],
      [ICONS.building, "First Floor Red"],
      [ICONS.building, "First Floor Blue"],
    ];
    return (
      <div style={shell}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0,1fr))",
            gap: 10,
          }}
        >
          {destinations.map(([icon, label], index) => (
            <div
              key={label}
              style={{
                padding: 13,
                borderRadius: 15,
                border:
                  index === 0 ? "1px solid #86efac" : "1px solid #dbeafe",
                background: index === 0 ? "#ecfdf5" : "#ffffff",
                fontSize: 12,
                fontWeight: 900,
                color: index === 0 ? "#047857" : "#334155",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: 25 }}>{icon}</div>
              <div style={{ marginTop: 5 }}>{label}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (
    scenario === "IB" &&
    ["ib_start_transit", "ib_journey", "delivered"].includes(stepKey)
  ) {
    const left = ibTransitPosition[stepKey] || "25%";
    return (
      <div style={{ ...shell, minHeight: 170 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            position: "relative",
            minHeight: 130,
          }}
        >
          <div style={stationBox}>
            <div style={{ fontSize: 32 }}>{ICONS.cbp}</div>
            <div style={labelStyle}>CBP</div>
          </div>

          <div
            style={{
              position: "absolute",
              left: 96,
              right: 96,
              top: 67,
              height: 4,
              borderRadius: 999,
              background:
                "linear-gradient(90deg, #bfdbfe 0%, #5aa9e6 55%, #1769aa 100%)",
            }}
          />

          <div
            style={{
              position: "absolute",
              left,
              top: 44,
              transform: "translateX(-50%)",
              fontSize: 33,
              whiteSpace: "nowrap",
              transition: "left 0.8s ease",
              animation:
                stepKey === "ib_journey"
                  ? "wchrTransitPulse 1.4s ease-in-out infinite"
                  : "none",
              zIndex: 3,
            }}
          >
            {ICONS.agent}{ICONS.wheelchair}{ICONS.passenger}
          </div>

          <div
            style={{
              position: "absolute",
              left: "50%",
              transform: "translateX(-50%)",
              top: 84,
              fontSize: 11,
              color: "#64748b",
              fontWeight: 900,
              background: "#fff",
              padding: "4px 8px",
              borderRadius: 999,
              border: "1px solid #dbeafe",
              zIndex: 2,
            }}
          >
            {stepKey === "delivered"
              ? isSpanish
                ? "Timer detenido"
                : "Timer stopped"
              : isSpanish
              ? "CBP → destino"
              : "CBP → destination"}
          </div>

          <div style={stationBox}>
            <div style={{ fontSize: 32 }}>{ICONS.building}</div>
            <div style={labelStyle}>Main Terminal</div>
          </div>
        </div>
      </div>
    );
  }

  if (scenario === "IB" && stepKey === "storage") {
    return (
      <div style={shell}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            minHeight: 120,
          }}
        >
          <div style={stationBox}>
            <div style={{ fontSize: 30 }}>{ICONS.building}</div>
            <div style={labelStyle}>
              {isSpanish ? "Pasajero Entregado" : "Passenger Delivered"}
            </div>
          </div>

          <div
            style={{
              fontSize: 34,
              animation: "wchrStorageMove 1.8s ease-in-out infinite alternate",
              whiteSpace: "nowrap",
            }}
          >
            {ICONS.agent}{ICONS.wheelchair}{ICONS.arrow}
          </div>

          <div
            style={{
              ...stationBox,
              background: "#fffbeb",
              border: "1px solid #fde68a",
            }}
          >
            <div style={{ fontSize: 30 }}>{ICONS.storage}</div>
            <div style={{ ...labelStyle, color: "#92400e" }}>
              WCHR Storage
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (scenario === "IB" && stepKey === "available") {
    return (
      <div style={shell}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0,1fr))",
            gap: 12,
          }}
        >
          <div
            style={{
              padding: 16,
              borderRadius: 16,
              background: "#ecfdf5",
              border: "1px solid #a7f3d0",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 34 }}>{ICONS.wheelchair}</div>
            <div
              style={{
                marginTop: 6,
                color: "#047857",
                fontWeight: 900,
              }}
            >
              WCHR AVAILABLE {ICONS.check}
            </div>
          </div>

          <div
            style={{
              padding: 16,
              borderRadius: 16,
              background: "#ecfdf5",
              border: "1px solid #a7f3d0",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 34 }}>{ICONS.agent}</div>
            <div
              style={{
                marginTop: 6,
                color: "#047857",
                fontWeight: 900,
              }}
            >
              AGENT AVAILABLE {ICONS.check}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={shell}>
      <div
        style={{
          minHeight: 110,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 38,
        }}
      >
        {scenario === "IB"
          ? `${ICONS.cbp} ${ICONS.agent}${ICONS.wheelchair}`
          : `${ICONS.agent}${ICONS.wheelchair} ${ICONS.gate}`}
      </div>
    </div>
  );
}


function formatTrainingTimer(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function ActionSimulator({
  scenario,
  stepKey,
  language,
  options,
  selectedAnswer,
  answerState,
  onAction,
  elapsedSeconds,
}) {
  const es = language === "es";

  const headerByStep = {
    supervisor_assigns: es ? "Nueva asignacion recibida" : "New assignment received",
    accept_assignment: es ? "My Active Assignment" : "My Active Assignment",
    pickup: es ? "Pasajero listo para pickup" : "Passenger ready for pickup",
    start_transit: es ? "Servicio listo para iniciar traslado" : "Service ready to start transit",
    journey: es ? "Servicio activo" : "Active service",
    arrived_gate: es ? "Llegada al gate" : "Gate arrival",
    supervisor_prepares: es ? "Pasajero IB disponible" : "IB passenger available",
    accept_pax: es ? "Available CBP Passengers" : "Available CBP Passengers",
    select_wchr: es ? "Seleccion de WCHR" : "Select WCHR",
    destination: es ? "Seleccion de destino" : "Select destination",
    ib_start_transit: es ? "Listo para salir de CBP" : "Ready to leave CBP",
    ib_journey: es ? "Servicio IB activo" : "Active IB service",
    delivered: es ? "Entrega de pasajero" : "Passenger delivery",
    storage: es ? "Storage pendiente" : "Storage pending",
    available: es ? "Servicio completado" : "Service completed",
  };

  const showTimer = [
    "start_transit",
    "journey",
    "arrived_gate",
    "ib_start_transit",
    "ib_journey",
    "delivered",
  ].includes(stepKey);

  return (
    <div
      style={{
        marginTop: 16,
        border: "1px solid #cfe7fb",
        borderRadius: 20,
        background: "#f8fbff",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "12px 14px",
          background: "linear-gradient(135deg, #0f4c81 0%, #1769aa 100%)",
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div
            style={{
              fontSize: 10,
              fontWeight: 900,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              opacity: 0.78,
            }}
          >
            {es ? "Simulacion del sistema" : "System simulation"}
          </div>
          <div style={{ marginTop: 2, fontSize: 14, fontWeight: 900 }}>
            {headerByStep[stepKey] || (es ? "Accion requerida" : "Action required")}
          </div>
        </div>

        {showTimer && (
          <div
            style={{
              padding: "7px 10px",
              borderRadius: 999,
              background: "rgba(255,255,255,0.14)",
              border: "1px solid rgba(255,255,255,0.22)",
              fontSize: 12,
              fontWeight: 900,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            Timer {formatTrainingTimer(elapsedSeconds)}
          </div>
        )}
      </div>

      <div style={{ padding: 14 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 10,
          }}
        >
          {options.map((option, index) => {
            const selected = selectedAnswer === option.label;
            const good = selected && answerState === "correct";
            const bad = selected && answerState === "incorrect";

            return (
              <button
                key={`${stepKey}-${option.label}`}
                type="button"
                onClick={() => onAction(option)}
                style={{
                  minHeight: 52,
                  borderRadius: 14,
                  padding: "11px 13px",
                  border: good
                    ? "1px solid #86efac"
                    : bad
                    ? "1px solid #fecdd3"
                    : index === 0
                    ? "1px solid #9ecff1"
                    : "1px solid #dbeafe",
                  background: good
                    ? "#ecfdf5"
                    : bad
                    ? "#fff1f2"
                    : index === 0
                    ? "linear-gradient(135deg, #edf7ff 0%, #ffffff 100%)"
                    : "#ffffff",
                  color: good ? "#047857" : bad ? "#be123c" : "#0f172a",
                  fontFamily: "inherit",
                  fontSize: 12.5,
                  fontWeight: 900,
                  cursor: "pointer",
                  boxShadow: selected ? "0 8px 18px rgba(15,23,42,0.07)" : "none",
                  transition: "transform 0.15s ease, box-shadow 0.15s ease",
                }}
              >
                {good ? "\u2705 " : bad ? "\u274C " : ""}
                {option.label}
              </button>
            );
          })}
        </div>

        <div
          style={{
            marginTop: 10,
            fontSize: 11,
            color: "#64748b",
            lineHeight: 1.5,
            textAlign: "center",
          }}
        >
          {es
            ? "Pulsa la misma accion que utilizarias en AeroStation Hub."
            : "Tap the same action you would use in AeroStation Hub."}
        </div>
      </div>
    </div>
  );
}


const REAL_WORLD_CHALLENGES = {
  OB: [
    {
      id: "gate_change",
      title: { en: "Gate Change", es: "Cambio de Gate" },
      alert: {
        en: "Operations updates the flight from Gate F87 to Gate F88 while the passenger is in transit.",
        es: "Operaciones cambia el vuelo de Gate F87 a Gate F88 mientras el pasajero esta en transito.",
      },
      question: {
        en: "What should you do?",
        es: "Que debes hacer?",
      },
      choices: [
        {
          label: { en: "Update Current Location / destination gate and continue to F88", es: "Actualizar Current Location / gate de destino y continuar a F88" },
          correct: true,
        },
        {
          label: { en: "Press Arrived at Gate for F87", es: "Presionar Arrived at Gate para F87" },
          correct: false,
        },
        {
          label: { en: "End the service immediately", es: "Terminar el servicio inmediatamente" },
          correct: false,
        },
      ],
      success: {
        en: "Correct. Keep the active journey accurate and deliver the passenger to the actual assigned gate.",
        es: "Correcto. Manten el journey actualizado y entrega al pasajero en el gate realmente asignado.",
      },
    },
    {
      id: "thirty_minute",
      title: { en: "30+ Minute Service Alert", es: "Alerta de Servicio 30+ Minutos" },
      alert: {
        en: "The active transport has reached 31 minutes because of terminal congestion.",
        es: "El traslado activo llego a 31 minutos debido a congestion en el terminal.",
      },
      question: {
        en: "What is the correct response?",
        es: "Cual es la respuesta correcta?",
      },
      choices: [
        {
          label: { en: "Continue safely, keep location/journey updated and follow the operational alert process", es: "Continuar de forma segura, mantener location/journey actualizado y seguir el proceso de alerta operacional" },
          correct: true,
        },
        {
          label: { en: "Mark Arrived at Gate before arrival to stop the timer", es: "Marcar Arrived at Gate antes de llegar para detener el timer" },
          correct: false,
        },
        {
          label: { en: "Cancel the passenger service", es: "Cancelar el servicio del pasajero" },
          correct: false,
        },
      ],
      success: {
        en: "Correct. Never falsify a milestone to improve the time. Operational timestamps must match the real service.",
        es: "Correcto. Nunca marques un milestone falso para mejorar el tiempo. Los timestamps deben coincidir con el servicio real.",
      },
    },
  ],
  IB: [
    {
      id: "wrong_wchr",
      title: { en: "Wheelchair No Longer Available", es: "Silla Ya No Disponible" },
      alert: {
        en: "WCHR #12 was selected, but inventory now shows it is assigned to another active service.",
        es: "Se selecciono WCHR #12, pero el inventario ahora muestra que esta asignada a otro servicio activo.",
      },
      question: {
        en: "What should you do?",
        es: "Que debes hacer?",
      },
      choices: [
        {
          label: { en: "Select another WCHR marked AVAILABLE", es: "Seleccionar otra WCHR marcada AVAILABLE" },
          correct: true,
        },
        {
          label: { en: "Use WCHR #12 anyway", es: "Usar WCHR #12 de todas formas" },
          correct: false,
        },
        {
          label: { en: "Type a wheelchair number manually", es: "Escribir manualmente un numero de silla" },
          correct: false,
        },
      ],
      success: {
        en: "Correct. Only a wheelchair currently AVAILABLE in inventory should be assigned.",
        es: "Correcto. Solo debe asignarse una silla que actualmente aparezca AVAILABLE en inventario.",
      },
    },
    {
      id: "destination_change",
      title: { en: "Passenger Changes Destination", es: "Pasajero Cambia el Destino" },
      alert: {
        en: "Before leaving CBP, the passenger requests Rental Car instead of Main Terminal.",
        es: "Antes de salir de CBP, el pasajero solicita Rental Car en lugar de Main Terminal.",
      },
      question: {
        en: "What should happen before Start Transit?",
        es: "Que debe ocurrir antes de Start Transit?",
      },
      choices: [
        {
          label: { en: "Update the destination to Rental Car, then Start Transit when physically leaving CBP", es: "Actualizar el destino a Rental Car y luego Start Transit al salir fisicamente de CBP" },
          correct: true,
        },
        {
          label: { en: "Keep Main Terminal and correct it after Delivered", es: "Mantener Main Terminal y corregirlo despues de Delivered" },
          correct: false,
        },
        {
          label: { en: "Start Transit first and decide later", es: "Hacer Start Transit primero y decidir despues" },
          correct: false,
        },
      ],
      success: {
        en: "Correct. The destination should reflect the real requested destination before transit begins.",
        es: "Correcto. El destino debe reflejar el destino real solicitado antes de comenzar el traslado.",
      },
    },
    {
      id: "pending_storage",
      title: { en: "Passenger Delivered — WCHR Still Active", es: "Pasajero Entregado — WCHR Sigue Activa" },
      alert: {
        en: "The passenger has been delivered, but the wheelchair has not yet been returned to storage.",
        es: "El pasajero fue entregado, pero la silla aun no ha sido llevada al storage.",
      },
      question: {
        en: "Can the agent accept another passenger now?",
        es: "Puede el agente aceptar otro pasajero ahora?",
      },
      choices: [
        {
          label: { en: "No. Store the WCHR first and confirm Store WCHR", es: "No. Primero guardar la WCHR y confirmar Store WCHR" },
          correct: true,
        },
        {
          label: { en: "Yes. Delivered makes the agent AVAILABLE", es: "Si. Delivered hace al agente AVAILABLE" },
          correct: false,
        },
      ],
      success: {
        en: "Correct. Delivered ends the passenger timer, but the agent remains BUSY and the WCHR remains assigned until Store WCHR.",
        es: "Correcto. Delivered termina el timer del pasajero, pero el agente permanece BUSY y la WCHR sigue asignada hasta Store WCHR.",
      },
    },
  ],
};

function ChallengePanel({ scenario, language, onComplete, onCorrect, onWrong }) {
  const challenges = REAL_WORLD_CHALLENGES[scenario] || [];
  const [index, setIndex] = React.useState(0);
  const [feedback, setFeedback] = React.useState("");
  const [selected, setSelected] = React.useState("");
  const current = challenges[index];

  if (!current) {
    return (
      <div style={{ padding: 18, borderRadius: 18, background: "#ecfdf5", border: "1px solid #a7f3d0", textAlign: "center" }}>
        <div style={{ fontSize: 34 }}>{"\u2705"}</div>
        <div style={{ marginTop: 6, fontSize: 18, fontWeight: 900, color: "#065f46" }}>
          {language === "es" ? "Practica Operacional Completada" : "Operational Practice Completed"}
        </div>
        <button type="button" onClick={onComplete} style={{ marginTop: 14, border: "none", borderRadius: 13, padding: "11px 16px", background: "#1769aa", color: "#fff", fontWeight: 900, cursor: "pointer" }}>
          {language === "es" ? "Continuar" : "Continue"} {"\u2192"}
        </button>
      </div>
    );
  }

  const choose = (choice, i) => {
    if (feedback === "correct") return;

    setSelected(String(i));

    if (choice.correct) {
      setFeedback("correct");
      onCorrect?.();
    } else {
      setFeedback("incorrect");
      onWrong?.();
    }
  };

  return (
    <div style={{ padding: 18, borderRadius: 20, background: "linear-gradient(135deg,#fff7ed 0%,#ffffff 60%,#eff6ff 100%)", border: "1px solid #fed7aa" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 900, color: "#c2410c", letterSpacing: "0.1em", textTransform: "uppercase" }}>
            {language === "es" ? "Situacion Inesperada" : "Unexpected Situation"}
          </div>
          <div style={{ marginTop: 4, fontSize: 20, fontWeight: 900, color: "#0f172a" }}>
            {"\u26A0\uFE0F"} {current.title[language]}
          </div>
        </div>
        <div style={{ padding: "6px 10px", borderRadius: 999, background: "#fff", border: "1px solid #fed7aa", color: "#9a3412", fontSize: 11, fontWeight: 900 }}>
          {index + 1}/{challenges.length}
        </div>
      </div>

      <div style={{ marginTop: 13, padding: 13, borderRadius: 14, background: "#fff", border: "1px solid #ffedd5", color: "#475569", lineHeight: 1.6, fontSize: 13 }}>
        {current.alert[language]}
      </div>

      <div style={{ marginTop: 14, fontWeight: 900, color: "#0f172a" }}>
        {current.question[language]}
      </div>

      <div style={{ display: "grid", gap: 9, marginTop: 10 }}>
        {current.choices.map((choice, i) => {
          const active = selected === String(i);
          return (
            <button key={i} type="button" onClick={() => choose(choice, i)} style={{
              textAlign: "left", padding: "12px 13px", borderRadius: 13, cursor: "pointer", fontFamily: "inherit", fontWeight: 800,
              border: active ? (choice.correct ? "1px solid #86efac" : "1px solid #fecaca") : "1px solid #dbeafe",
              background: active ? (choice.correct ? "#ecfdf5" : "#fff1f2") : "#fff",
              color: active ? (choice.correct ? "#047857" : "#be123c") : "#334155"
            }}>
              {choice.label[language]}
            </button>
          );
        })}
      </div>

      {feedback && (
        <div style={{
          marginTop: 12, padding: 12, borderRadius: 13, fontSize: 13, fontWeight: 800, lineHeight: 1.55,
          background: feedback === "correct" ? "#ecfdf5" : "#fff1f2",
          border: feedback === "correct" ? "1px solid #a7f3d0" : "1px solid #fecdd3",
          color: feedback === "correct" ? "#065f46" : "#9f1239"
        }}>
          {feedback === "correct"
            ? `\u2705 ${current.success[language]}`
            : language === "es"
            ? "\u274C Esa accion no corresponde al procedimiento. Intenta nuevamente."
            : "\u274C That action does not match the procedure. Try again."}
        </div>
      )}

      {feedback === "correct" && (
        <button type="button" onClick={() => { setIndex((v) => v + 1); setFeedback(""); setSelected(""); }} style={{
          marginTop: 13, border: "none", borderRadius: 13, padding: "11px 15px",
          background: "linear-gradient(135deg,#0f4c81,#1769aa)", color: "#fff", fontWeight: 900, cursor: "pointer"
        }}>
          {language === "es" ? "Siguiente Situacion" : "Next Situation"} {"\u2192"}
        </button>
      )}
    </div>
  );
}

export default function WchrTrainingPage() {
  const navigate = useNavigate();
  const { user } = useUser();

  const [language, setLanguage] = useState("en");
  const [scenario, setScenario] = useState("");
  const [stepIndex, setStepIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState("");
  const [answerState, setAnswerState] = useState("");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [completedScenarios, setCompletedScenarios] = useState({
    OB: false,
    IB: false,
  });
  const [challengeMode, setChallengeMode] = useState(false);
  const [savingCompletion, setSavingCompletion] = useState(false);
  const [completionMessage, setCompletionMessage] = useState("");
  const [scenarioStats, setScenarioStats] = useState({
    OB: { correct: 0, incorrect: 0, score: null, completedAt: "" },
    IB: { correct: 0, incorrect: 0, score: null, completedAt: "" },
  });

  const steps = useMemo(() => {
    if (scenario === "OB") return OB_STEPS;
    if (scenario === "IB") return IB_STEPS;
    return [];
  }, [scenario]);

  const currentStep = steps[stepIndex] || null;
  const currentText = currentStep?.[language] || null;

  const progress =
    steps.length > 0 ? Math.round(((stepIndex + 1) / steps.length) * 100) : 0;

  useEffect(() => {
    if (!currentStep) {
      setElapsedSeconds(0);
      return;
    }

    const activeTimerSteps = new Set([
      "start_transit",
      "journey",
      "ib_start_transit",
      "ib_journey",
    ]);

    if (currentStep.key === "start_transit" || currentStep.key === "ib_start_transit") {
      setElapsedSeconds(0);
    }

    if (!activeTimerSteps.has(currentStep.key)) return;

    const interval = window.setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);

    return () => window.clearInterval(interval);
  }, [currentStep?.key]);

  const resetAnswer = () => {
    setSelectedAnswer("");
    setAnswerState("");
  };

  const startScenario = (value) => {
    setScenario(value);
    setStepIndex(0);
    setChallengeMode(false);
    setCompletionMessage("");
    setCompletedScenarios((prev) => ({ ...prev, [value]: false }));
    setScenarioStats((prev) => ({
      ...prev,
      [value]: { correct: 0, incorrect: 0, score: null, completedAt: "" },
    }));
    resetAnswer();
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const goBackToScenarios = () => {
    setScenario("");
    setStepIndex(0);
    setChallengeMode(false);
    resetAnswer();
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleAnswer = (option) => {
    if (!scenario || answerState === "correct") return;

    setSelectedAnswer(option.label);

    if (option.correct) {
      setAnswerState("correct");
      setScenarioStats((prev) => ({
        ...prev,
        [scenario]: {
          ...prev[scenario],
          correct: Number(prev[scenario]?.correct || 0) + 1,
        },
      }));
    } else {
      setAnswerState("incorrect");
      setScenarioStats((prev) => ({
        ...prev,
        [scenario]: {
          ...prev[scenario],
          incorrect: Number(prev[scenario]?.incorrect || 0) + 1,
        },
      }));
    }
  };

  const handleNext = () => {
    if (!currentStep || answerState !== "correct") return;

    if (stepIndex < steps.length - 1) {
      setStepIndex((prev) => prev + 1);
      resetAnswer();
      return;
    }

    setChallengeMode(true);
  };

  const calculateScenarioScore = (scenarioKey) => {
    const stats = scenarioStats[scenarioKey] || { correct: 0, incorrect: 0 };
    const attempts = Number(stats.correct || 0) + Number(stats.incorrect || 0);

    if (attempts <= 0) return 0;

    return Math.max(
      0,
      Math.min(100, Math.round((Number(stats.correct || 0) / attempts) * 100))
    );
  };

  const saveScenarioCompletion = async (scenarioKey) => {
    const score = calculateScenarioScore(scenarioKey);
    const completedAtClient = new Date().toISOString();
    const employeeName =
      user?.employeeName ||
      user?.displayName ||
      user?.fullName ||
      user?.name ||
      user?.username ||
      "Unknown Employee";

    const stats = scenarioStats[scenarioKey] || {
      correct: 0,
      incorrect: 0,
    };

    try {
      setSavingCompletion(true);
      setCompletionMessage("");

      await addDoc(collection(db, "wchr_training_completions"), {
        employeeId: user?.employeeId || "",
        userId: user?.id || "",
        username: user?.username || "",
        employeeName,
        role: user?.role || "",
        department: user?.department || "",
        scenario: scenarioKey,
        scenarioLabel:
          scenarioKey === "OB"
            ? "Outbound Counter to Gate"
            : "Inbound CBP to Destination to Storage",
        language,
        correctAnswers: Number(stats.correct || 0),
        incorrectAnswers: Number(stats.incorrect || 0),
        score,
        passed: score >= 80,
        trainingVersion: "WCHR_INTERACTIVE_V5",
        completedAt: serverTimestamp(),
        completedAtClient,
      });

      setScenarioStats((prev) => ({
        ...prev,
        [scenarioKey]: {
          ...prev[scenarioKey],
          score,
          completedAt: completedAtClient,
        },
      }));

      setCompletedScenarios((prev) => ({
        ...prev,
        [scenarioKey]: true,
      }));

      setCompletionMessage(
        language === "es"
          ? "Resultado guardado correctamente en el historial de entrenamiento."
          : "Training result saved successfully."
      );
    } catch (error) {
      console.error("Error saving WCHR training completion:", error);

      // Do not lose the employee's completed training screen if Firestore fails.
      setScenarioStats((prev) => ({
        ...prev,
        [scenarioKey]: {
          ...prev[scenarioKey],
          score,
          completedAt: completedAtClient,
        },
      }));

      setCompletedScenarios((prev) => ({
        ...prev,
        [scenarioKey]: true,
      }));

      setCompletionMessage(
        language === "es"
          ? "El entrenamiento fue completado, pero no se pudo guardar el resultado en Firestore."
          : "Training was completed, but the result could not be saved to Firestore."
      );
    } finally {
      setSavingCompletion(false);
      setChallengeMode(false);
    }
  };

  const scenarioComplete = scenario && completedScenarios[scenario];

  const allComplete = completedScenarios.OB && completedScenarios.IB;

  return (
    <div
      style={{
        display: "grid",
        gap: 18,
        fontFamily: "Poppins, Inter, system-ui, sans-serif",
        width: "100%",
        maxWidth: 1180,
        margin: "0 auto",
        minWidth: 0,
      }}
    >
      <div
        style={{
          background:
            "linear-gradient(135deg, #0f5c91 0%, #1f7cc1 42%, #6ec6e8 100%)",
          borderRadius: 28,
          padding: 24,
          color: "#ffffff",
          boxShadow: "0 24px 60px rgba(23,105,170,0.22)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            width: 220,
            height: 220,
            borderRadius: 999,
            background: "rgba(255,255,255,0.08)",
            top: -85,
            right: -45,
          }}
        />

        <div
          style={{
            position: "relative",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 900,
                textTransform: "uppercase",
                letterSpacing: "0.18em",
                color: "rgba(255,255,255,0.78)",
              }}
            >
              WCHR Interactive Training
            </div>

            <h1
              style={{
                margin: "10px 0 6px",
                fontSize: 32,
                fontWeight: 900,
                letterSpacing: "-0.04em",
                lineHeight: 1.05,
              }}
            >
              {language === "en" ? "Let's Train Together" : "Entrenemos Juntos"}
            </h1>

            <p
              style={{
                margin: 0,
                maxWidth: 760,
                fontSize: 14,
                lineHeight: 1.65,
                color: "rgba(255,255,255,0.9)",
              }}
            >
              {language === "en"
                ? "Practice the exact operational sequence for outbound and inbound WCHR services using guided steps, visual movement and decision questions."
                : "Practica la secuencia operacional exacta para servicios WCHR de salida y llegada utilizando pasos guiados, movimiento visual y preguntas de decisión."}
            </p>
          </div>

          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <TrainingButton
              variant={language === "en" ? "primary" : "secondary"}
              onClick={() => setLanguage("en")}
            >
              🇺🇸 English
            </TrainingButton>

            <TrainingButton
              variant={language === "es" ? "primary" : "secondary"}
              onClick={() => setLanguage("es")}
            >
              🇪🇸 Español
            </TrainingButton>

            <TrainingButton variant="secondary" onClick={() => navigate("/wchr")}>
              ← {language === "en" ? "WCHR Dashboard" : "Dashboard WCHR"}
            </TrainingButton>
          </div>
        </div>
      </div>

      {!scenario && (
        <>
          <PageCard style={{ padding: 20 }}>
            <div
              style={{
                fontSize: 20,
                fontWeight: 900,
                color: "#0f172a",
              }}
            >
              {language === "en"
                ? "Choose a training scenario"
                : "Selecciona un escenario de entrenamiento"}
            </div>

            <div
              style={{
                marginTop: 6,
                fontSize: 13,
                color: "#64748b",
                lineHeight: 1.6,
              }}
            >
              {language === "en"
                ? "Complete both scenarios to review the full WCHR workflow."
                : "Completa ambos escenarios para repasar el flujo completo de WCHR."}
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                gap: 14,
                marginTop: 16,
              }}
            >
              <ScenarioCard
                icon={`${String.fromCodePoint(0x1F6EB)} ${String.fromCodePoint(0x1F9D1, 0x200D, 0x1F9BD)}`}
                title={SCENARIOS.OB[language].title}
                subtitle={SCENARIOS.OB[language].subtitle}
                description={SCENARIOS.OB[language].description}
                onClick={() => startScenario("OB")}
              />

              <ScenarioCard
                icon={`${String.fromCodePoint(0x1F6EC)} ${String.fromCodePoint(0x1F9D1, 0x200D, 0x1F9BD)}`}
                title={SCENARIOS.IB[language].title}
                subtitle={SCENARIOS.IB[language].subtitle}
                description={SCENARIOS.IB[language].description}
                onClick={() => startScenario("IB")}
              />
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: 10,
                marginTop: 16,
              }}
            >
              <div
                style={{
                  padding: 14,
                  borderRadius: 16,
                  background: completedScenarios.OB ? "#ecfdf5" : "#f8fbff",
                  border: completedScenarios.OB
                    ? "1px solid #a7f3d0"
                    : "1px solid #dbeafe",
                  fontWeight: 800,
                  color: completedScenarios.OB ? "#047857" : "#64748b",
                }}
              >
                OB: {completedScenarios.OB ? "Completed ✅" : "Pending"}
              </div>

              <div
                style={{
                  padding: 14,
                  borderRadius: 16,
                  background: completedScenarios.IB ? "#ecfdf5" : "#f8fbff",
                  border: completedScenarios.IB
                    ? "1px solid #a7f3d0"
                    : "1px solid #dbeafe",
                  fontWeight: 800,
                  color: completedScenarios.IB ? "#047857" : "#64748b",
                }}
              >
                IB: {completedScenarios.IB ? "Completed ✅" : "Pending"}
              </div>
            </div>
          </PageCard>

          {allComplete && (
            <PageCard style={{ padding: 20 }}>
              <div
                style={{
                  padding: 18,
                  borderRadius: 18,
                  background: "#ecfdf5",
                  border: "1px solid #a7f3d0",
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: 42 }}>{String.fromCodePoint(0x1F3C6)}</div>
                <div
                  style={{
                    marginTop: 8,
                    fontSize: 22,
                    fontWeight: 900,
                    color: "#065f46",
                  }}
                >
                  {language === "en"
                    ? "WCHR Training Completed"
                    : "Entrenamiento WCHR Completado"}
                </div>
                <div
                  style={{
                    marginTop: 6,
                    fontSize: 13,
                    color: "#047857",
                  }}
                >
                  {language === "en"
                    ? "You completed both outbound and inbound guided scenarios."
                    : "Completaste los escenarios guiados de salida y llegada."}
                </div>
              </div>
            </PageCard>
          )}
        </>
      )}

      {scenario && currentStep && !scenarioComplete && !challengeMode && (
        <>
          <PageCard style={{ padding: 20 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 900,
                    color: "#1769aa",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                  }}
                >
                  {scenario === "OB"
                    ? SCENARIOS.OB[language].subtitle
                    : SCENARIOS.IB[language].subtitle}
                </div>
                <div
                  style={{
                    marginTop: 4,
                    fontSize: 18,
                    fontWeight: 900,
                    color: "#0f172a",
                  }}
                >
                  {language === "en"
                    ? `Step ${stepIndex + 1} of ${steps.length}`
                    : `Paso ${stepIndex + 1} de ${steps.length}`}
                </div>
              </div>

              <TrainingButton variant="secondary" onClick={goBackToScenarios}>
                ← {language === "en" ? "Change Scenario" : "Cambiar Escenario"}
              </TrainingButton>
            </div>

            <div
              style={{
                marginTop: 14,
                height: 10,
                background: "#e2e8f0",
                borderRadius: 999,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${progress}%`,
                  height: "100%",
                  background:
                    "linear-gradient(90deg, #1769aa 0%, #5aa9e6 100%)",
                  transition: "width 0.35s ease",
                }}
              />
            </div>
          </PageCard>

          <PageCard style={{ padding: 20 }}>
            <TrainingVisual
              scenario={scenario}
              stepKey={currentStep.key}
              language={language}
            />

            <div
              style={{
                marginTop: 18,
                textAlign: "center",
              }}
            >
              <div
                style={{
                  fontSize: 42,
                  lineHeight: 1.2,
                }}
              >
                {currentStep.emoji}
              </div>

              <div
                style={{
                  marginTop: 14,
                  display: "inline-flex",
                  padding: "6px 10px",
                  borderRadius: 999,
                  background: "#edf7ff",
                  border: "1px solid #bfdbfe",
                  color: "#1769aa",
                  fontSize: 11,
                  fontWeight: 900,
                  letterSpacing: "0.06em",
                }}
              >
                {currentStep.status}
              </div>

              <h2
                style={{
                  margin: "14px 0 0",
                  fontSize: 24,
                  color: "#0f172a",
                  fontWeight: 900,
                  letterSpacing: "-0.025em",
                }}
              >
                {currentText.title}
              </h2>

              <p
                style={{
                  margin: "9px 0 0",
                  maxWidth: 760,
                  color: "#475569",
                  fontSize: 14,
                  lineHeight: 1.7,
                }}
              >
                {currentText.description}
              </p>

              <div
                style={{
                  marginTop: 14,
                  maxWidth: 780,
                  padding: "12px 14px",
                  borderRadius: 14,
                  background: "#fffbeb",
                  border: "1px solid #fde68a",
                  color: "#92400e",
                  fontSize: 13,
                  fontWeight: 800,
                  lineHeight: 1.6,
                }}
              >
                {"\u{1F4A1}"} {currentText.instruction}
              </div>
            </div>

            <style>
              {`
                @keyframes wchrAgentApproach {
                  from { transform: translateX(-12px); }
                  to { transform: translateX(12px); }
                }

                @keyframes wchrTransitPulse {
                  0%, 100% { transform: translateX(-50%) scale(1); }
                  50% { transform: translateX(-50%) scale(1.08); }
                }

                @keyframes wchrStorageMove {
                  from { transform: translateX(-12px); }
                  to { transform: translateX(12px); }
                }
              `}
            </style>
          </PageCard>

          <PageCard style={{ padding: 20 }}>
            <div
              style={{
                fontSize: 16,
                fontWeight: 900,
                color: "#0f172a",
              }}
            >
              {currentText.prompt}
            </div>

            <ActionSimulator
              scenario={scenario}
              stepKey={currentStep.key}
              language={language}
              options={currentText.options}
              selectedAnswer={selectedAnswer}
              answerState={answerState}
              onAction={handleAnswer}
              elapsedSeconds={elapsedSeconds}
            />

            {answerState && (
              <div
                style={{
                  marginTop: 14,
                  padding: "13px 15px",
                  borderRadius: 15,
                  background:
                    answerState === "correct" ? "#ecfdf5" : "#fff1f2",
                  border:
                    answerState === "correct"
                      ? "1px solid #a7f3d0"
                      : "1px solid #fecdd3",
                  color:
                    answerState === "correct" ? "#065f46" : "#9f1239",
                  fontSize: 13,
                  fontWeight: 800,
                  lineHeight: 1.6,
                }}
              >
                {answerState === "correct"
                  ? `\u2705 ${currentText.success}`
                  : `\u274C ${currentText.error}`}
              </div>
            )}

            <div
              style={{
                marginTop: 16,
                display: "flex",
                gap: 10,
                justifyContent: "space-between",
                flexWrap: "wrap",
              }}
            >
              <TrainingButton
                variant="secondary"
                disabled={stepIndex === 0}
                onClick={() => {
                  if (stepIndex === 0) return;
                  setStepIndex((prev) => prev - 1);
                  resetAnswer();
                }}
              >
                ← {language === "en" ? "Previous" : "Anterior"}
              </TrainingButton>

              <TrainingButton
                variant="primary"
                disabled={answerState !== "correct"}
                onClick={handleNext}
              >
                {stepIndex === steps.length - 1
                  ? language === "en"
                    ? "Complete Scenario ✓"
                    : "Completar Escenario ✓"
                  : language === "en"
                  ? "Next Step →"
                  : "Siguiente Paso →"}
              </TrainingButton>
            </div>
          </PageCard>

          <PageCard style={{ padding: 20 }}>
            <div
              style={{
                fontSize: 12,
                fontWeight: 900,
                color: "#64748b",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                marginBottom: 10,
              }}
            >
              {language === "en" ? "Training Flow" : "Flujo de Entrenamiento"}
            </div>

            <div
              style={{
                display: "flex",
                gap: 7,
                flexWrap: "wrap",
              }}
            >
              {steps.map((step, index) => (
                <div
                  key={step.key}
                  style={{
                    padding: "7px 9px",
                    borderRadius: 999,
                    fontSize: 11,
                    fontWeight: 800,
                    background:
                      index < stepIndex
                        ? "#ecfdf5"
                        : index === stepIndex
                        ? "#edf7ff"
                        : "#f8fafc",
                    color:
                      index < stepIndex
                        ? "#047857"
                        : index === stepIndex
                        ? "#1769aa"
                        : "#64748b",
                    border:
                      index < stepIndex
                        ? "1px solid #a7f3d0"
                        : index === stepIndex
                        ? "1px solid #bfdbfe"
                        : "1px solid #e2e8f0",
                  }}
                >
                  {index + 1}. {step[language].title}
                </div>
              ))}
            </div>
          </PageCard>
        </>
      )}

      {scenario && challengeMode && !scenarioComplete && (
        <PageCard style={{ padding: 20 }}>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 900, color: "#1769aa", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              {language === "es" ? "Modo Escenario Real" : "Real Scenario Mode"}
            </div>
            <div style={{ marginTop: 4, fontSize: 22, fontWeight: 900, color: "#0f172a" }}>
              {scenario === "OB" ? "Flight AV 219 · Gate F87" : "Inbound Arrival · CBP"}
            </div>
            <div style={{ marginTop: 5, fontSize: 12, color: "#64748b", lineHeight: 1.6 }}>
              {scenario === "OB"
                ? (language === "es" ? "Passenger: Maria Perez · WCHR #12 · Agent: Training User" : "Passenger: Maria Perez · WCHR #12 · Agent: Training User")
                : (language === "es" ? "Passenger: Maria Perez · WCHR #12 · Destination: Main Terminal" : "Passenger: Maria Perez · WCHR #12 · Destination: Main Terminal")}
            </div>
          </div>

          <ChallengePanel
            scenario={scenario}
            language={language}
            onCorrect={() =>
              setScenarioStats((prev) => ({
                ...prev,
                [scenario]: {
                  ...prev[scenario],
                  correct: Number(prev[scenario]?.correct || 0) + 1,
                },
              }))
            }
            onWrong={() =>
              setScenarioStats((prev) => ({
                ...prev,
                [scenario]: {
                  ...prev[scenario],
                  incorrect: Number(prev[scenario]?.incorrect || 0) + 1,
                },
              }))
            }
            onComplete={() => saveScenarioCompletion(scenario)}
          />
        </PageCard>
      )}

      {scenario && scenarioComplete && (
        <PageCard style={{ padding: 22 }}>
          <div
            style={{
              textAlign: "center",
              padding: 18,
              borderRadius: 20,
              background: "#ecfdf5",
              border: "1px solid #a7f3d0",
            }}
          >
            <div style={{ fontSize: 48 }}>{"\u2705"}</div>
            <div
              style={{
                marginTop: 8,
                fontSize: 24,
                fontWeight: 900,
                color: "#065f46",
              }}
            >
              {language === "en"
                ? "Scenario Completed"
                : "Escenario Completado"}
            </div>

            <div
              style={{
                marginTop: 7,
                fontSize: 13,
                color: "#047857",
                lineHeight: 1.6,
              }}
            >
              {scenario === "OB"
                ? language === "en"
                  ? "You completed the Outbound Counter → Gate workflow."
                  : "Completaste el flujo Outbound Counter → Gate."
                : language === "en"
                ? "You completed the Inbound CBP → Destination → Storage workflow."
                : "Completaste el flujo Inbound CBP → Destino → Storage."}
            </div>

            <div
              style={{
                margin: "18px auto 0",
                maxWidth: 760,
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                gap: 10,
              }}
            >
              <div style={{ padding: 14, borderRadius: 14, background: "#ffffff", border: "1px solid #a7f3d0" }}>
                <div style={{ fontSize: 10, fontWeight: 900, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  {language === "es" ? "Empleado" : "Employee"}
                </div>
                <div style={{ marginTop: 5, fontSize: 14, fontWeight: 900, color: "#0f172a" }}>
                  {user?.employeeName || user?.displayName || user?.fullName || user?.name || user?.username || "Training User"}
                </div>
              </div>

              <div style={{ padding: 14, borderRadius: 14, background: "#ffffff", border: "1px solid #a7f3d0" }}>
                <div style={{ fontSize: 10, fontWeight: 900, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Score
                </div>
                <div style={{ marginTop: 5, fontSize: 22, fontWeight: 950, color: Number(scenarioStats[scenario]?.score || 0) >= 80 ? "#047857" : "#be123c" }}>
                  {Number(scenarioStats[scenario]?.score || 0)}%
                </div>
              </div>

              <div style={{ padding: 14, borderRadius: 14, background: "#ffffff", border: "1px solid #a7f3d0" }}>
                <div style={{ fontSize: 10, fontWeight: 900, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  {language === "es" ? "Resultado" : "Result"}
                </div>
                <div style={{ marginTop: 5, fontSize: 14, fontWeight: 950, color: Number(scenarioStats[scenario]?.score || 0) >= 80 ? "#047857" : "#be123c" }}>
                  {Number(scenarioStats[scenario]?.score || 0) >= 80
                    ? language === "es" ? "APROBADO" : "PASSED"
                    : language === "es" ? "REPASAR" : "REVIEW"}
                </div>
              </div>

              <div style={{ padding: 14, borderRadius: 14, background: "#ffffff", border: "1px solid #a7f3d0" }}>
                <div style={{ fontSize: 10, fontWeight: 900, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  {language === "es" ? "Fecha" : "Date"}
                </div>
                <div style={{ marginTop: 5, fontSize: 12, fontWeight: 900, color: "#0f172a" }}>
                  {scenarioStats[scenario]?.completedAt
                    ? new Date(scenarioStats[scenario].completedAt).toLocaleString()
                    : "—"}
                </div>
              </div>
            </div>

            {completionMessage && (
              <div
                style={{
                  margin: "12px auto 0",
                  maxWidth: 760,
                  padding: "11px 13px",
                  borderRadius: 13,
                  background: completionMessage.toLowerCase().includes("could not") || completionMessage.toLowerCase().includes("no se pudo")
                    ? "#fff7ed"
                    : "#ecfdf5",
                  border: completionMessage.toLowerCase().includes("could not") || completionMessage.toLowerCase().includes("no se pudo")
                    ? "1px solid #fdba74"
                    : "1px solid #a7f3d0",
                  color: completionMessage.toLowerCase().includes("could not") || completionMessage.toLowerCase().includes("no se pudo")
                    ? "#9a3412"
                    : "#065f46",
                  fontSize: 12,
                  fontWeight: 800,
                }}
              >
                {completionMessage}
              </div>
            )}

            <div
              style={{
                display: "flex",
                justifyContent: "center",
                gap: 10,
                flexWrap: "wrap",
                marginTop: 18,
              }}
            >
              <TrainingButton
                variant="secondary"
                onClick={() => {
                  setCompletedScenarios((prev) => ({
                    ...prev,
                    [scenario]: false,
                  }));
                  setStepIndex(0);
                  resetAnswer();
                }}
              >
                ↻ {language === "en" ? "Repeat Scenario" : "Repetir Escenario"}
              </TrainingButton>

              <TrainingButton variant="primary" onClick={goBackToScenarios}>
                {language === "en"
                  ? "Choose Another Scenario →"
                  : "Seleccionar Otro Escenario →"}
              </TrainingButton>
            </div>
          </div>
        </PageCard>
      )}

      <PageCard style={{ padding: 18 }}>
        <div
          style={{
            fontSize: 12,
            color: "#64748b",
            lineHeight: 1.65,
            textAlign: "center",
          }}
        >
          {language === "en"
            ? "Training mode is for practice only. It does not create, assign, modify or complete live WCHR services."
            : "El modo de entrenamiento es solamente para práctica. No crea, asigna, modifica ni completa servicios WCHR reales."}
        </div>
      </PageCard>
    </div>
  );
}
