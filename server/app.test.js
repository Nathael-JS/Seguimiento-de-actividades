import { test } from 'node:test'
import assert from 'node:assert/strict'
import { build } from './app.js'

const login = (payload) => build().inject({ method: 'POST', url: '/api/login', payload })

test('login correcto por correo, alias o número de empleado', async () => {
  for (const usuario of ['jorge.salinas@empresa.com', ' Jorge.Salinas ', '10482']) {
    const res = await login({ usuario, password: 'demo1234' })
    assert.equal(res.statusCode, 200, usuario)
    assert.equal(res.json().name, 'Jorge Salinas')
    assert.equal(res.json().password, undefined)
  }
})

test('contraseña o usuario incorrecto da 401', async () => {
  assert.equal((await login({ usuario: '10482', password: 'mala' })).statusCode, 401)
  assert.equal((await login({ usuario: 'nadie', password: 'demo1234' })).statusCode, 401)
})

test('entrada inválida da 400', async () => {
  for (const payload of [{}, { usuario: '', password: 'x' }, { usuario: '   ', password: 'x' }, { usuario: 'a'.repeat(101), password: 'x' }]) {
    assert.equal((await login(payload)).statusCode, 400, JSON.stringify(payload))
  }
})
