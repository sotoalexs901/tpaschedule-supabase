import { useState } from "react";

const defaultAirlines = [
  "West Jet",
  "Avianca",
  "Sun Country",
  "World Atlantic",
];

export default function CierreVuelo() {
  const [airlines, setAirlines] = useState(defaultAirlines);
  const [selectedAirline, setSelectedAirline] = useState("");
  const [newAirline, setNewAirline] = useState("");

  const [formData, setFormData] = useState({
    fecha: "",
    vuelo: "",
    pasajeros: "",
    comentarios: "",
  });

  const addAirline = () => {
    if (!newAirline) return;

    setAirlines([...airlines, newAirline]);
    setSelectedAirline(newAirline);
    setNewAirline("");
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    const existing =
      JSON.parse(localStorage.getItem("cierreVuelos")) || [];

    existing.push({
      ...formData,
      airline: selectedAirline,
      createdAt: new Date().toISOString(),
      closed: false,
    });

    localStorage.setItem(
      "cierreVuelos",
      JSON.stringify(existing)
    );

    alert("Registro guardado");

    setFormData({
      fecha: "",
      vuelo: "",
      pasajeros: "",
      comentarios: "",
    });
  };

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-6">
        Cierre de Vuelo
      </h1>

      <div className="bg-white rounded-xl shadow p-6">
        <div className="mb-4">
          <label className="block mb-2 font-semibold">
            Aerolínea
          </label>

          <select
            value={selectedAirline}
            onChange={(e) =>
              setSelectedAirline(e.target.value)
            }
            className="w-full border rounded-lg p-3"
          >
            <option value="">Seleccionar</option>

            {airlines.map((airline) => (
              <option key={airline} value={airline}>
                {airline}
              </option>
            ))}
          </select>
        </div>

        <div className="flex gap-2 mb-6">
          <input
            type="text"
            placeholder="Agregar Airline"
            value={newAirline}
            onChange={(e) =>
              setNewAirline(e.target.value)
            }
            className="border rounded-lg p-3 flex-1"
          />

          <button
            onClick={addAirline}
            className="bg-blue-600 text-white px-4 rounded-lg"
          >
            Agregar
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-4"
        >
          <input
            type="date"
            value={formData.fecha}
            onChange={(e) =>
              setFormData({
                ...formData,
                fecha: e.target.value,
              })
            }
            className="w-full border rounded-lg p-3"
          />

          <input
            type="text"
            placeholder="Vuelo"
            value={formData.vuelo}
            onChange={(e) =>
              setFormData({
                ...formData,
                vuelo: e.target.value,
              })
            }
            className="w-full border rounded-lg p-3"
          />

          <input
            type="number"
            placeholder="Pasajeros"
            value={formData.pasajeros}
            onChange={(e) =>
              setFormData({
                ...formData,
                pasajeros: e.target.value,
              })
            }
            className="w-full border rounded-lg p-3"
          />

          <textarea
            placeholder="Comentarios"
            value={formData.comentarios}
            onChange={(e) =>
              setFormData({
                ...formData,
                comentarios: e.target.value,
              })
            }
            className="w-full border rounded-lg p-3"
          />

          <button
            type="submit"
            className="bg-green-600 text-white px-6 py-3 rounded-lg"
          >
            Guardar
          </button>
        </form>
      </div>
    </div>
  );
}
