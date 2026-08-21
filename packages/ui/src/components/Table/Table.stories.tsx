import type { Meta, StoryObj } from "@storybook/react-vite";
import { Badge } from "../Badge/Badge";
import { Checkbox } from "../Checkbox/Checkbox";
import { Mono } from "../Typography/Mono";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "./Table";

const meta: Meta<typeof Table> = {
  title: "Componentes/Table",
  component: Table,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          'Tabela do Lurem (index.html id="tabela"). Coluna de valor sempre à direita, mono e ' +
          "tabular. A linha agendada usa a cor de estimativa mesmo dentro da tabela — o princípio não tem exceção contextual.",
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof Table>;

/** Composição real: `Table` + `Checkbox`, `Badge` e `Mono` — a tabela em si não sabe nada de dinheiro ou categoria. */
export const Extrato: Story = {
  render: () => (
    <div
      style={{
        width: "38rem",
        borderRadius: "var(--lr-r-md)",
        border: "1px solid var(--lr-border)",
        overflow: "hidden",
      }}
    >
      <Table>
        <TableHead>
          <tr>
            <TableHeaderCell style={{ width: 34 }} />
            <TableHeaderCell>Data</TableHeaderCell>
            <TableHeaderCell>Descrição</TableHeaderCell>
            <TableHeaderCell>Categoria</TableHeaderCell>
            <TableHeaderCell numeric>Valor</TableHeaderCell>
          </tr>
        </TableHead>
        <TableBody>
          <TableRow>
            <TableCell>
              <Checkbox
                aria-label="Selecionar transação"
                label=""
                checked
                onChange={() => {}}
              />
            </TableCell>
            <TableCell>05/07</TableCell>
            <TableCell>Supermercado Zaffari</TableCell>
            <TableCell>
              <Badge kind="category" color="sand">
                Alimentação
              </Badge>
            </TableCell>
            <TableCell numeric>
              <Mono tone="out">−284,15</Mono>
            </TableCell>
          </TableRow>
          <TableRow>
            <TableCell>
              <Checkbox
                aria-label="Selecionar transação"
                label=""
                onChange={() => {}}
              />
            </TableCell>
            <TableCell>05/07</TableCell>
            <TableCell>Salário</TableCell>
            <TableCell>
              <Badge kind="category" color="sage">
                Renda
              </Badge>
            </TableCell>
            <TableCell numeric>
              <Mono tone="in">+8.400,00</Mono>
            </TableCell>
          </TableRow>
          <TableRow>
            <TableCell>
              <Checkbox
                aria-label="Selecionar transação"
                label=""
                onChange={() => {}}
              />
            </TableCell>
            <TableCell>07/07</TableCell>
            <TableCell>PIX para conta Inter</TableCell>
            <TableCell>
              <Badge kind="status" status="pending">
                Transferência
              </Badge>
            </TableCell>
            <TableCell numeric>
              <Mono>1.000,00</Mono>
            </TableCell>
          </TableRow>
          <TableRow>
            <TableCell>
              <Checkbox
                aria-label="Selecionar transação"
                label=""
                onChange={() => {}}
              />
            </TableCell>
            <TableCell>10/07</TableCell>
            <TableCell>
              Aluguel{" "}
              <Badge kind="status" status="estimate">
                Agendada
              </Badge>
            </TableCell>
            <TableCell>
              <Badge kind="category" color="blue">
                Moradia
              </Badge>
            </TableCell>
            <TableCell numeric>
              <Mono tone="estimate">−2.100,00</Mono>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  ),
};
