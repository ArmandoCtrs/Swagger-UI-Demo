const express = require('express');
const cors = require("cors");
const swaggerUi = require("swagger-ui-express");
const fs = require("fs");
const users = require("./users");
const swaggerDocument = require("./openapi.json");


const app = express();
const port = 3000;

app.use(cors());
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));
app.use(express.json());


// GET: Retrieve all users
app.get("/api/users", (req, res) => {
    res.status(200).json(users);
});

// GET: Retrieve a user by ID
app.get("/api/users/:id", (req, res) => {
    const id = Number(req.params.id);

    const user = users.find(user => user.id === id);

    if (!user) {
        return res.status(404).json({
            message: "User not found"
        });
    }

    res.status(200).json(user);
});

// POST: Create a new user
app.post("/api/users", (req, res) => {
    const { name, email, role } = req.body;

    if (!name || !email || !role) {
        return res.status(400).json({
            message: "Name, email, and role are required"
        });
    }

    const newUser = {
        id: users.length > 0
            ? Math.max(...users.map(user => user.id)) + 1
            : 1,
        name,
        email,
        role
    };

    users.push(newUser);

    res.status(201).json({
        message: "User created successfully",
        user: newUser
    });
});


// PUT: Update an existing user
app.put("/api/users/:id", (req, res) => {
    const id = Number(req.params.id);

    const user = users.find(user => user.id === id);

    if (!user) {
        return res.status(404).json({
            message: "User not found"
        });
    }

    const { name, email, role } = req.body;

    if (!name || !email || !role) {
        return res.status(400).json({
            message: "Name, email, and role are required"
        });
    }

    user.name = name;
    user.email = email;
    user.role = role;

    res.status(200).json({
        message: "User updated successfully",
        user
    });
});


// DELETE: Delete a user
app.delete("/api/users/:id", (req, res) => {
    const id = Number(req.params.id);

    const userIndex = users.findIndex(user => user.id === id);

    if (userIndex === -1) {
        return res.status(404).json({
            message: "User not found"
        });
    }

    const deletedUser = users.splice(userIndex, 1)[0];

    res.status(200).json({
        message: "User deleted successfully",
        user: deletedUser
    });
});

app.listen(port, () => {
  console.log("To access the Swagger UI for this server, go to: http://localhost:3000/api-docs/ ");
});